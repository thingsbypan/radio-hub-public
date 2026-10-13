(function (root) {
  const states = new Set(['live', 'stale', 'unavailable', 'error', 'loading', 'not-connected']);
  function metricModel(metric, now = Date.now()) {
    const value = typeof metric.value === 'number' && Number.isFinite(metric.value) ? metric.value : null;
    const observed = metric.observedAt ? Date.parse(metric.observedAt) : NaN;
    const age = Number.isFinite(observed) ? now - observed : null;
    let state = states.has(metric.state) ? metric.state : value === null ? 'unavailable' : 'live';
    if (state === 'live' && value === null) state = 'unavailable';
    if (state === 'live' && (!Number.isFinite(observed) || age < -60000)) state = 'unavailable';
    if (state === 'live' && Number.isFinite(metric.maxAgeMs) && age > metric.maxAgeMs) state = 'stale';
    const displayValue = ['live', 'stale'].includes(state) ? value : null;
    const ranged = displayValue !== null && Number.isFinite(metric.min) && Number.isFinite(metric.max) && metric.max > metric.min;
    return { ...metric, value: displayValue, state, age,
      fraction: ranged ? Math.max(0, Math.min(1, (displayValue - metric.min) / (metric.max - metric.min))) : null };
  }
  function element(tag, className, text) {
    const node = document.createElement(tag); node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function status(container, state, label) {
    container.classList.add('echo-status'); container.dataset.state = states.has(state) ? state : 'unavailable';
    container.textContent = label; container.setAttribute('role', 'status');
  }
  function metric(container, input) {
    const data = metricModel(input);
    container.replaceChildren(); container.classList.add('echo-metric'); container.dataset.state = data.state;
    const heading = element('div', 'echo-metric-heading');
    heading.append(element('span', 'echo-metric-label', data.label));
    const value = data.value === null ? '--' : data.value.toLocaleString(undefined, { maximumFractionDigits: data.decimals ?? 1 });
    heading.append(element('strong', 'echo-metric-value', `${value}${data.unit ? ` ${data.unit}` : ''}`));
    container.append(heading);
    if (Number.isFinite(data.min) && Number.isFinite(data.max)) {
      const meter = element('meter', 'echo-meter'); meter.min = data.min; meter.max = data.max;
      if (data.fraction !== null) { meter.value = Math.max(data.min, Math.min(data.max, data.value)); meter.setAttribute('aria-label', `${data.label}: ${value} ${data.unit || ''}`); }
      else { meter.hidden = true; }
      container.append(meter);
    }
    const note = element('small', 'echo-metric-note', data.value === null ? data.reason || 'No reading' : `${data.state === 'stale' ? 'Stale / ' : ''}${data.source || 'Source unspecified'}`);
    container.append(note);
    return data;
  }
  function history(container, options = {}) {
    const canvas = element('canvas', 'echo-history'), empty = element('span', 'echo-history-empty', options.emptyLabel || 'No samples');
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', options.label || 'Metric history');
    container.classList.add('echo-history-frame'); container.replaceChildren(canvas, empty);
    let samples = [], destroyed = false;
    function draw() {
      if (destroyed) return;
      const box = container.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(box.width * ratio)); canvas.height = Math.max(1, Math.round(box.height * ratio));
      const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio);
      const w = box.width, h = box.height, left = 35, right = w - 10, top = 12, bottom = h - 22;
      const min = options.min ?? 0, max = options.max ?? 100;
      ctx.font = '10px Segoe UI'; ctx.fillStyle = '#7e9296'; ctx.strokeStyle = '#253033';
      for (let i = 0; i <= 2; i++) {
        const y = top + (bottom - top) * i / 2;
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
        ctx.fillText(String(max - (max - min) * i / 2), 5, y + 3);
      }
      const valid = samples.filter(s => Number.isFinite(s.time) && Number.isFinite(s.value));
      // Empty data is never drawn as a zero-valued signal.
      empty.hidden = valid.length > 0;
      if (!valid.length || max <= min) return;
      const start = valid[0].time, duration = Math.max(1, valid.at(-1).time - start);
      ctx.strokeStyle = options.color || '#8cb9c1'; ctx.lineWidth = 1.5; ctx.beginPath();
      let penDown = false;
      for (const point of samples) {
        if (!Number.isFinite(point.time) || !Number.isFinite(point.value)) { penDown = false; continue; }
        const x = left + (point.time - start) / duration * (right - left);
        const y = bottom - Math.max(0, Math.min(1, (point.value - min) / (max - min))) * (bottom - top);
        if (penDown) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        penDown = true;
      }
      ctx.stroke();
      ctx.fillText(new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), left, h - 5);
    }
    const observer = new ResizeObserver(draw); observer.observe(container);
    return {
      setData(points) { samples = points.slice(-(options.maxSamples || 240)); draw(); },
      destroy() { destroyed = true; observer.disconnect(); container.replaceChildren(); },
    };
  }
  function metadata(container, values) {
    const list = element('dl', 'echo-metadata');
    for (const [key, value] of Object.entries(values)) list.append(element('dt', '', key), element('dd', '', String(value || 'Unavailable')));
    container.replaceChildren(list);
  }
  function audioLevels(samples) {
    if (!samples.length || samples.some(n => !Number.isFinite(n))) return { rms: null, peak: null };
    const rms = Math.max(-100, 20 * Math.log10(Math.sqrt(samples.reduce((sum, n) => sum + n * n, 0) / samples.length)));
    const peak = Math.max(-100, 20 * Math.log10(samples.reduce((max, n) => Math.max(max, Math.abs(n)), 0)));
    return { rms, peak };
  }
  function audioPlot(canvas, empty, getSource) {
    let mode = 'spectrum', lastMetrics = 0;
    const change = event => { mode = event.detail === 'waveform' ? 'waveform' : 'spectrum'; canvas.setAttribute('aria-label', `Received audio ${mode}`); };
    window.addEventListener('echo-audio-mode', change);
    const timer = setInterval(() => {
      const { audio, analyser, context } = getSource();
      const box = canvas.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
      const w = Math.round(box.width * ratio), h = Math.round(box.height * ratio);
      if (!w || !h) return;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, w, h);
      const running = !audio.paused && audio.readyState >= 3;
      const available = running && analyser && context?.state === 'running';
      empty.hidden = Boolean(available); empty.textContent = !running ? 'Waiting for audio' : 'Audio analysis unavailable';
      let rms = null, peak = null;
      if (available) {
        const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples);
        ({ rms, peak } = audioLevels(samples));
        ctx.strokeStyle = '#292929'; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
        if (mode === 'waveform') {
          ctx.strokeStyle = '#8cb9c1'; ctx.lineWidth = ratio; ctx.beginPath();
          samples.forEach((n, i) => { const x = i / (samples.length - 1) * w, y = (1 - n) * h / 2; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke();
        } else {
          const bins = new Uint8Array(analyser.frequencyBinCount); analyser.getByteFrequencyData(bins); ctx.fillStyle = '#8cb9c1';
          for (let i = 0; i < 48; i++) {
            const from = Math.floor(Math.pow(bins.length, i / 48) - 1), to = Math.min(bins.length, Math.max(from + 1, Math.floor(Math.pow(bins.length, (i + 1) / 48))));
            let value = 0; for (let j = from; j < to; j++) value = Math.max(value, bins[j]);
            const height = value / 255 * h; ctx.fillRect(i * w / 48, h - height, Math.max(1, w / 48 - 2 * ratio), height);
          }
        }
      }
      if (Date.now() - lastMetrics > 500) { lastMetrics = Date.now(); window.dispatchEvent(new CustomEvent('echo-audio-metrics', { detail: { rms, peak } })); }
    }, 70);
    return { destroy() { clearInterval(timer); window.removeEventListener('echo-audio-mode', change); } };
  }
  const api = { metricModel, metric, status, history, metadata, audioPlot, audioLevels };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EchoDashboard = api;
})(typeof window !== 'undefined' ? window : globalThis);
