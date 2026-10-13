(() => {
  const $ = id => document.getElementById(id);
  const map = L.map('radar-map', { minZoom: 3, maxZoom: 7, zoomControl: true }).setView([38, -96], 4);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 7,
  }).addTo(map);
  map.attributionControl.addAttribution('Radar: <a href="https://www.rainviewer.com/">RainViewer</a>');
  let frames = [], layers = new Map(), index = 0, playing = true, visible = true;
  let busy = false, version = 0, refreshId = 0, timer, currentLayer, local = [33.8053, -84.1443];
  function buttons() {
    $('radar-play').replaceChildren();
    const icon = document.createElement('i'); icon.dataset.lucide = playing ? 'pause' : 'play'; $('radar-play').append(icon);
    $('radar-play').title = playing ? 'Pause radar' : 'Play radar'; $('radar-play').setAttribute('aria-label', $('radar-play').title);
    lucide.createIcons();
  }
  function schedule() {
    clearTimeout(timer);
    if (playing && visible && frames.length > 1) timer = setTimeout(() => show((index + 1) % frames.length), index === frames.length - 1 ? 1800 : 850);
  }
  async function show(next) {
    if (!frames[next] || busy) return;
    busy = true; const stamp = version, frame = frames[next];
    let entry = layers.get(frame.path);
    if (!entry) {
      const layer = L.tileLayer(`https://tilecache.rainviewer.com${frame.path}/512/{z}/{x}/{y}/2/1_1.png`, {
        tileSize: 512, zoomOffset: -1, maxZoom: 7, opacity: 0, zIndex: 300, keepBuffer: 0, updateWhenIdle: true,
      });
      entry = { layer, loaded: false, failed: false }; layers.set(frame.path, entry);
      layer.on('tileerror', () => { entry.failed = true; });
      $('radar-status').textContent = 'Loading radar frame...';
      await new Promise(resolve => {
        const timeout = setTimeout(() => { entry.failed = true; resolve(); }, 15000);
        layer.once('load', () => { clearTimeout(timeout); entry.loaded = true; resolve(); });
        layer.addTo(map);
      });
    }
    if (stamp !== version) return;
    busy = false;
    if (entry.failed) {
      playing = false; buttons(); $('radar-status').textContent = 'Radar tiles unavailable. Try refresh.'; return;
    }
    if (currentLayer && currentLayer !== entry.layer) currentLayer.setOpacity(0);
    currentLayer = entry.layer; currentLayer.setOpacity(.8); index = next;
    $('radar-time').value = index;
    const date = new Date(frame.time * 1000);
    $('radar-clock').textContent = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    $('radar-clock').dateTime = date.toISOString();
    const stale = Date.now() - frames.at(-1).time * 1000 > 45 * 60000;
    $('radar-status').textContent = `${stale ? 'Delayed data / ' : ''}${index + 1} of ${frames.length} frames / RainViewer`;
    schedule();
  }
  function resetLayers() {
    ++version; clearTimeout(timer); busy = false;
    for (const entry of layers.values()) map.removeLayer(entry.layer);
    layers.clear(); currentLayer = null;
  }
  async function refresh() {
    const id = ++refreshId; resetLayers(); frames = [];
    $('radar-play').disabled = true; $('radar-time').disabled = true; $('radar-clock').textContent = '--';
    $('radar-status').textContent = 'Loading radar history...';
    try {
      const response = await fetch('https://api.rainviewer.com/public/weather-maps.json', { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Radar unavailable');
      const data = await response.json(); if (id !== refreshId) return;
      const past = data.radar?.past?.filter(f => Number.isFinite(f.time) && /^\/v2\/radar\/[a-z0-9]+$/i.test(f.path));
      if (!past?.length) throw new Error('No radar frames');
      // Twenty-minute sampling bounds tile requests while preserving the two-hour loop.
      frames = past.filter((_f, i) => i % 2 === 0 || i === past.length - 1);
      $('radar-time').max = frames.length - 1; $('radar-time').disabled = false; $('radar-play').disabled = false;
      index = 0; show(0);
    } catch (_) { if (id === refreshId) $('radar-status').textContent = 'Radar history unavailable. Try refresh.'; }
  }
  $('radar-play').addEventListener('click', () => { playing = !playing; buttons(); if (playing) schedule(); else clearTimeout(timer); });
  $('radar-time').addEventListener('input', () => { playing = false; clearTimeout(timer); buttons(); if (busy) resetLayers(); show(Number($('radar-time').value)); });
  $('radar-refresh').addEventListener('click', refresh);
  $('radar-home').addEventListener('click', () => map.setView([38, -96], 4));
  $('radar-local').addEventListener('click', () => map.setView(local, 6));
  window.addEventListener('weather-location', event => { local = [event.detail.lat, event.detail.lon]; });
  map.on('movestart', resetLayers);
  map.on('moveend', () => { if (frames.length) show(index); });
  function mode(radar) {
    visible = radar; $('radar-view').hidden = !radar; $('satellite-view').hidden = radar;
    $('radar-mode').setAttribute('aria-pressed', radar); $('satellite-mode').setAttribute('aria-pressed', !radar);
    if (radar) { map.invalidateSize(); schedule(); } else clearTimeout(timer);
  }
  $('radar-mode').addEventListener('click', () => mode(true));
  $('satellite-mode').addEventListener('click', () => mode(false));
  const resize = new ResizeObserver(() => { if (visible) map.invalidateSize(); }); resize.observe($('radar-map'));
  const refreshTimer = setInterval(() => { if (visible) refresh(); }, 10 * 60000);
  refresh();
  window.addEventListener('beforeunload', () => { ++refreshId; resetLayers(); clearInterval(refreshTimer); resize.disconnect(); map.remove(); }, { once: true });
})();
