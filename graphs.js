(() => {
  if (document.getElementById('terminal-graphs')) return;
  const receiver = document.querySelector('body > .mainspan');
  const controls = receiver?.querySelector('div:has(> .ctl > form[name="freqform"])');
  const tabs = receiver?.querySelector(':scope > .tabs');
  if (!controls || !tabs) return;

  const strip = document.createElement('section');
  strip.id = 'terminal-graphs';
  const createGraph = (label, units, id) => {
    const panel = document.createElement('div');
    const heading = document.createElement('header');
    const title = document.createElement('span');
    title.textContent = label;
    const unit = document.createElement('span');
    unit.textContent = units;
    heading.append(title, unit);
    const canvas = document.createElement('canvas');
    canvas.id = id;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', label + ', ' + units);
    panel.append(heading, canvas);
    strip.append(panel);
    return canvas;
  };
  const historyCanvas = createGraph('SIGNAL HISTORY', 'dBm / last 2 minutes', 'terminal-history');
  const spectrumCanvas = createGraph('AUDIO SPECTRUM', 'dBFS / 0-8 kHz', 'terminal-spectrum');
  controls.after(strip);

  const settings = document.createElement('details');
  settings.id = 'terminal-settings';
  const summary = document.createElement('summary');
  summary.textContent = 'Receiver settings';
  tabs.before(settings);
  settings.append(summary, tabs);
  settings.addEventListener('toggle', () => window.dispatchEvent(new Event('resize')));
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));

  const contexts = new Map();
  const resize = new ResizeObserver(() => {
    for (const canvas of [historyCanvas, spectrumCanvas]) {
      const box = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(box.width * ratio);
      canvas.height = Math.round(box.height * ratio);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      contexts.set(canvas, { ctx, width: box.width, height: box.height });
    }
  });
  resize.observe(strip);

  const history = [];
  let audioSource;
  let analyser;
  let silentOutput;
  let bins;
  let lastSample = 0;
  let previousFrequency;

  function detach() {
    if (audioSource && analyser) {
      try { audioSource.disconnect(analyser); } catch (_) { /* Receiver may have restarted. */ }
    }
    analyser?.disconnect();
    silentOutput?.disconnect();
    audioSource = analyser = silentOutput = bins = undefined;
  }

  function attach() {
    const source = window.soundapplet?.p;
    if (source === audioSource) return;
    detach();
    if (!source?.context || typeof source.connect !== 'function') return;
    try {
      audioSource = source;
      analyser = source.context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.75;
      bins = new Float32Array(analyser.frequencyBinCount);
      // A silent parallel branch measures the audio without changing its original output.
      silentOutput = source.context.createGain();
      silentOutput.gain.value = 0;
      source.connect(analyser);
      analyser.connect(silentOutput);
      silentOutput.connect(source.context.destination);
    } catch (error) {
      detach();
      console.warn('Audio graph unavailable:', error.message);
    }
  }

  function frame(canvas, lower, upper, xLabels) {
    const surface = contexts.get(canvas);
    if (!surface || surface.width < 80) return;
    const { ctx, width, height } = surface;
    const plot = { x: 38, y: 7, width: width - 46, height: height - 26 };
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0b0b0b';
    ctx.fillRect(0, 0, width, height);
    ctx.font = '10px Segoe UI, sans-serif';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 2; i++) {
      const y = plot.y + plot.height * i / 2;
      ctx.strokeStyle = '#282828';
      ctx.beginPath(); ctx.moveTo(plot.x, y); ctx.lineTo(width - 8, y); ctx.stroke();
      ctx.fillStyle = '#939393'; ctx.textAlign = 'right';
      ctx.fillText(Math.round(upper - (upper - lower) * i / 2), plot.x - 6, y + 3);
    }
    for (let i = 0; i < xLabels.length; i++) {
      const x = plot.x + plot.width * i / (xLabels.length - 1);
      ctx.textAlign = i === 0 ? 'left' : i === xLabels.length - 1 ? 'right' : 'center';
      ctx.fillText(xLabels[i], x, height - 3);
    }
    return { ...surface, plot };
  }

  function message(surface, text) {
    if (!surface) return;
    surface.ctx.fillStyle = '#aaa';
    surface.ctx.textAlign = 'center';
    surface.ctx.fillText(text, surface.width / 2, surface.height / 2);
  }

  function draw() {
    attach();
    const now = performance.now();
    const running = audioSource?.context.state === 'running';
    const frequency = document.querySelector('input[name="frequency"]')?.value;
    if (now - lastSample >= 250) {
      lastSample = now;
      const value = Number.parseFloat(document.querySelector('#numericalsmeter')?.textContent);
      history.push({ time: now, value: running && Number.isFinite(value) ? value : null,
        gap: frequency !== previousFrequency });
      previousFrequency = frequency;
      while (history.length && history[0].time < now - 120000) history.shift();
    }
    const values = history.filter(p => p.value !== null).map(p => p.value);
    const lower = values.length ? Math.floor((Math.min(...values) - 3) / 5) * 5 : -110;
    const upper = values.length ? Math.max(lower + 10, Math.ceil((Math.max(...values) + 3) / 5) * 5) : -90;
    const h = frame(historyCanvas, lower, upper, ['-120s', '-60s', 'now']);
    if (h && values.length) {
      const { ctx, plot } = h;
      ctx.strokeStyle = '#d3ac6e'; ctx.lineWidth = 1.5; ctx.beginPath();
      let joined = false;
      for (const sample of history) {
        if (sample.value === null) { joined = false; continue; }
        const x = plot.x + plot.width * (1 - (now - sample.time) / 120000);
        const y = plot.y + plot.height * (upper - sample.value) / (upper - lower);
        if (!joined || sample.gap) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        joined = true;
      }
      ctx.stroke();
    } else message(h, running ? 'Waiting for signal data' : 'Waiting for audio');

    const s = frame(spectrumCanvas, -100, 0, ['0', '2k', '4k', '6k', '8 kHz']);
    if (s && running && analyser) {
      analyser.getFloatFrequencyData(bins);
      const { ctx, plot } = s;
      const limit = Math.min(bins.length - 1, Math.floor(8000 * analyser.fftSize / audioSource.context.sampleRate));
      ctx.strokeStyle = '#8cb9c1'; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let i = 0; i <= limit; i++) {
        const value = Number.isFinite(bins[i]) ? Math.max(-100, Math.min(0, bins[i])) : -100;
        const x = plot.x + plot.width * i / limit;
        const y = plot.y - value / 100 * plot.height;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else message(s, audioSource ? 'Waiting for audio' : 'Audio spectrum unavailable');
  }

  const timer = setInterval(draw, 100);
  window.addEventListener('beforeunload', () => {
    clearInterval(timer);
    resize.disconnect();
    detach();
  }, { once: true });
})();
