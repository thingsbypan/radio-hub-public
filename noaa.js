(() => {
  const $ = id => document.getElementById(id);
  let audio = $('audio'), context, source, analyser, bins;
  const canvas = $('audio-spectrum'), paint = canvas.getContext('2d');
  function audioButtons() {
    for (const [id, icon, label] of [
      ['audio-toggle', audio.paused ? 'play' : 'pause', audio.paused ? 'Play audio' : 'Pause audio'],
      ['audio-mute', audio.muted || !audio.volume ? 'volume-x' : 'volume-2', audio.muted ? 'Unmute audio' : 'Mute audio'],
    ]) {
      const element = document.createElement('i'); element.dataset.lucide = icon;
      $(id).replaceChildren(element); $(id).title = label; $(id).setAttribute('aria-label', label);
    }
    $('audio-mute').setAttribute('aria-pressed', audio.muted); lucide.createIcons();
  }
  async function connectGraph() {
    if (!audio.crossOrigin) return;
    context ||= new AudioContext();
    if (!source) {
      analyser = context.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = .75;
      bins = new Uint8Array(analyser.frequencyBinCount);
      source = context.createMediaElementSource(audio); source.connect(analyser); analyser.connect(context.destination);
    }
    await context.resume();
  }
  const graph = EchoDashboard.audioPlot($('audio-spectrum'), $('audio-plot-status'), () => ({ audio, analyser, context }));
  const stateNames = 'Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|District of Columbia|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming'.split('|');
  let stations = [], selected, playId = 0, audioTimer, weatherId = 0, mapId = 0;
  let location = { lat: 33.8053, lon: -84.1443, name: 'Atlanta, Georgia' }, pinned = false;
  function read(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function save(key, value) { try { localStorage.setItem(key, value); } catch (_) {} }
  function status(text) { $('status').textContent = text; }
  function audioError(message) { clearTimeout(audioTimer); audio.pause(); $('error').textContent = message; $('error').hidden = false; status('Unavailable'); }
  function timeout() { clearTimeout(audioTimer); audioTimer = setTimeout(() => audioError('The audio feed did not respond. Reconnect or choose another station.'), 20000); }
  async function play() {
    if (!selected?.url) return;
    const id = ++playId; $('error').hidden = true; status('Connecting'); timeout();
    try { await connectGraph(); if (id !== playId) return; await audio.play(); } catch (e) {
      if (id !== playId || e.name === 'AbortError') return;
      if (e.name === 'NotAllowedError') { clearTimeout(audioTimer); status('Ready - press play'); }
      else audioError('This relay cannot play right now. Reconnect or choose another station.');
    }
  }
  function choose(autoplay = false, plainAudio = false) {
    ++playId; clearTimeout(audioTimer); audio.pause(); audio.removeAttribute('src'); audio.load();
    window.EchoCatchAudio?.detach(); source?.disconnect(); analyser?.disconnect(); source = undefined; analyser = undefined;
    // A fresh element allows plain playback when a relay does not permit audio analysis.
    const previous = audio, next = document.createElement('audio');
    next.id = 'audio'; next.hidden = true; next.preload = 'none'; next.volume = previous.volume; next.muted = previous.muted;
    if (!plainAudio) next.crossOrigin = 'anonymous';
    previous.replaceWith(next); audio = next; bindAudio(next, plainAudio);
    selected = stations.find(s => s.id === $('station').value);
    window.dispatchEvent(new CustomEvent('echo-source', { detail: selected ? { Station: selected.call, Location: `${selected.city}, ${selected.state}`, Frequency: `${selected.frequency} MHz`, Relay: selected.url ? selected.provider : 'No online stream available', 'RF quality': 'Not reported by internet relay' } : { Station: 'No listed feed' } }));
    $('error').hidden = true; $('reconnect').disabled = !selected?.url;
    $('audio-toggle').disabled = !selected?.url; audioButtons();
    if (!selected) {
      $('frequency').textContent = '--'; $('coverage').textContent = 'No live internet relay listed for this state.'; $('provider').textContent = ''; status('No listed feed'); return;
    }
    $('frequency').textContent = selected.frequency;
    $('coverage').textContent = `${selected.city}, ${selected.state} / ${selected.call}${selected.coverage ? ` / ${selected.coverage} / ${selected.powerWatts} W` : ''}`;
    $('provider').textContent = selected.url ? `Relay: ${selected.provider}` : selected.localRole;
    save('noaaCall', selected.call); save('noaaState', selected.state);
    if (!pinned) { location = stationLocation(); forecast(); }
    if (!selected.url) {
      status('Stream unavailable');
      $('error').textContent = `No online audio stream is currently available for ${selected.call} ${selected.city}. Local radio: ${selected.frequency} MHz. No alternate station has been selected.`;
      $('error').hidden = false; return;
    }
    audio.src = selected.url; audio.load(); status('Ready - press play');
    if (autoplay) play();
  }
  function stationLocation() {
    return { lat: selected.forecastLat ?? selected.lat, lon: selected.forecastLon ?? selected.lon, name: selected.forecastLocation || `${selected.city}, ${selected.state}` };
  }
  function listStations(wanted) {
    const items = stations.filter(s => s.state === $('state').value);
    $('station').replaceChildren(...items.map(s => new Option(`${s.city} - ${s.call}${s.localRole ? ' / Regional coverage' : ''}`, s.id)));
    $('station').disabled = !items.length;
    if (!items.length) $('station').add(new Option('No listed live feed', ''));
    const previous = items.find(s => s.call === wanted); if (previous) $('station').value = previous.id;
    save('noaaState', $('state').value); choose(true);
  }
  async function json(url) {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`Request returned ${r.status}`);
    return r.json();
  }
  async function forecast() {
    const id = ++weatherId, place = { ...location };
    window.dispatchEvent(new CustomEvent('weather-location', { detail: place }));
    $('weather-location').textContent = place.name;
    $('weather-status').textContent = 'Loading NWS forecast...'; $('forecast').replaceChildren();
    try {
      const point = await json(`https://api.weather.gov/points/${place.lat.toFixed(4)},${place.lon.toFixed(4)}`);
      if (id !== weatherId) return;
      const url = point.properties.forecast;
      if (!url?.startsWith('https://api.weather.gov/')) throw new Error('No forecast available');
      const data = await json(url); if (id !== weatherId) return;
      const periods = data.properties.periods;
      if (!periods?.length) throw new Error('Empty forecast');
      const updated = new Date(data.properties.updateTime);
      const stale = !Number.isFinite(+updated) || Date.now() - updated > 12 * 3600000;
      $('weather-status').textContent = `${stale ? 'Possibly stale / ' : ''}NWS issued ${Number.isFinite(+updated) ? updated.toLocaleString() : 'time unavailable'}`;
      for (const period of periods.slice(0, 6)) {
        const article = document.createElement('article'); article.className = 'forecast-period';
        const head = document.createElement('header'), name = document.createElement('b'), temp = document.createElement('strong');
        name.textContent = period.name; temp.textContent = `${period.temperature ?? '--'} ${period.temperatureUnit}`; head.append(name, temp);
        const text = document.createElement('p'); text.textContent = period.detailedForecast;
        const wind = document.createElement('small'); wind.textContent = `Wind ${period.windDirection} ${period.windSpeed}`;
        article.append(head, text, wind); $('forecast').append(article);
      }
    } catch (_) { if (id === weatherId) $('weather-status').textContent = 'NWS forecast unavailable. Try refresh or another ZIP code.'; }
  }
  const satelliteUrls = {
    conus: 'https://cdn.star.nesdis.noaa.gov/GOES19/ABI/CONUS/GEOCOLOR/1250x750.jpg',
    east: 'https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/GEOCOLOR/1808x1808.jpg',
    west: 'https://cdn.star.nesdis.noaa.gov/GOES18/ABI/FD/GEOCOLOR/1808x1808.jpg',
  };
  function satellite() {
    const id = ++mapId, image = new Image();
    $('satellite').hidden = true; $('expand-map').disabled = true; $('map-time').textContent = '';
    $('map-status').hidden = false; $('map-status').textContent = 'Loading satellite image...';
    const timer = setTimeout(() => { if (id === mapId) { ++mapId; $('map-status').textContent = 'Satellite request timed out. Try refresh.'; } }, 20000);
    image.onload = () => {
      clearTimeout(timer); if (id !== mapId) return;
      $('satellite').src = image.src; $('large-satellite').src = image.src;
      $('satellite').hidden = false; $('map-status').hidden = true; $('expand-map').disabled = false;
      $('map-time').textContent = `Retrieved ${new Date().toLocaleTimeString()} / image time printed in UTC`;
    };
    image.onerror = () => { clearTimeout(timer); if (id === mapId) $('map-status').textContent = 'Satellite image unavailable. Try refresh.'; };
    image.src = `${satelliteUrls[$('satellite-region').value]}?t=${Math.floor(Date.now() / 300000)}`;
  }
  $('state').addEventListener('change', () => listStations());
  $('station').addEventListener('change', () => choose(true));
  $('reconnect').addEventListener('click', () => choose(true));
  function bindAudio(element, plainAudio) {
    const on = (event, handler) => element.addEventListener(event, () => { if (element === audio) handler(); });
    on('play', () => { $('error').hidden = true; status('Connecting'); timeout(); audioButtons(); });
    on('playing', () => { clearTimeout(audioTimer); status('Playing'); audioButtons(); });
    on('waiting', () => { if (!audio.paused) { status('Buffering'); timeout(); } });
    on('pause', () => { if (audio.paused) { clearTimeout(audioTimer); if ($('error').hidden && selected) status('Paused'); audioButtons(); } });
    on('error', () => {
      if (!audio.getAttribute('src')) return;
      if (!plainAudio) { choose(true, true); return; }
      audioError('The selected relay is unavailable. Try another station.');
    });
  }
  $('audio-toggle').addEventListener('click', () => { if (audio.paused) play(); else audio.pause(); });
  $('audio-mute').addEventListener('click', () => { audio.muted = !audio.muted; audioButtons(); });
  $('audio-volume').addEventListener('input', () => { audio.volume = Number($('audio-volume').value); audio.muted = false; audioButtons(); });
  $('zip-form').addEventListener('submit', async e => {
    e.preventDefault(); const zip = $('zip').value.trim(); if (!/^\d{5}$/.test(zip)) return;
    const id = ++weatherId; $('forecast').replaceChildren(); $('weather-status').textContent = 'Finding ZIP code...';
    try {
      const data = await json(`https://api.zippopotam.us/us/${zip}`); if (id !== weatherId) return;
      const place = data.places?.[0]; if (!place) throw new Error('Unknown ZIP');
      location = { lat: Number(place.latitude), lon: Number(place.longitude), name: `${place['place name']}, ${place['state abbreviation']} ${zip}` };
      pinned = true; save('noaaWeatherZip', zip); forecast();
    } catch (_) { if (id === weatherId) $('weather-status').textContent = 'ZIP code not found or lookup unavailable.'; }
  });
  $('follow-station').addEventListener('click', () => { pinned = false; save('noaaWeatherZip', ''); $('zip').value = ''; if (selected) { location = stationLocation(); forecast(); } });
  $('refresh-weather').addEventListener('click', forecast);
  $('refresh-map').addEventListener('click', satellite);
  $('satellite-region').addEventListener('change', () => { save('noaaSatellite', $('satellite-region').value); satellite(); });
  $('expand-map').addEventListener('click', () => $('map-dialog').showModal());
  $('close-map').addEventListener('click', () => $('map-dialog').close());
  async function initialize() {
    try {
      const data = await json('noaa-stations.json'); stations = NoaaLocal.merge(data.stations);
      // Preserve the previously verified relays for existing listeners.
      for (const s of stations) {
        if (s.call === 'KEC80') s.url = 'https://wxr.gwes-cdn.net/KEC80-ALT';
        if (s.call === 'WNG522') s.url = 'https://wxr.gwes-cdn.net/WNG522';
      }
      $('directory-status').textContent = `${stations.length} stations / ${stations.filter(s => s.url).length} listed relays / directory ${new Date(data.updated).toLocaleDateString()}`;
      for (const name of stateNames) { const count = stations.filter(s => s.state === name).length; $('state').add(new Option(`${name} (${count})`, name)); }
      const preference = NoaaLocal.startup(read, save);
      $('state').value = stateNames.includes(preference.state) ? preference.state : 'Alabama'; $('state').disabled = false;
      listStations(preference.call);
    } catch (_) { $('directory-status').textContent = 'Station directory could not load. Reload to try again.'; forecast(); }
    const zip = read('noaaWeatherZip'); if (/^\d{5}$/.test(zip || '')) { $('zip').value = zip; $('zip-form').requestSubmit(); }
  }

  window.echoCatchMetadata = () => ({frequency:selected ? Number(selected.frequency) : null,frequency_unit:'MHz',frequency_khz:selected ? Number(selected.frequency)*1000 : null,mode:selected ? 'FM' : null,receiver:selected?.call || null,receiver_id:selected?.id || null,receiver_location:selected ? `${selected.city}, ${selected.state}` : null,source_url:selected?.url || null,filter_width_hz:null,signal_dbm:null,snr_db:null,active_band:null});

  const catchTapTimer=setInterval(() => {
    const m=window.echoCatchMetadata();
    window.EchoCatchAudio?.attach(source,JSON.stringify([m.receiver_id,m.receiver,m.source_url]),()=>!audio.paused && audio.readyState>=3);
  },100);
  window.addEventListener('beforeunload',()=>clearInterval(catchTapTimer),{once:true});
  audio.volume = .6; lucide.createIcons();
  if (satelliteUrls[read('noaaSatellite')]) $('satellite-region').value = read('noaaSatellite');
  initialize(); satellite();
  const forecastTimer = setInterval(forecast, 15 * 60000), mapTimer = setInterval(satellite, 5 * 60000);
  window.addEventListener('beforeunload', () => { ++playId; ++weatherId; ++mapId; clearTimeout(audioTimer); graph.destroy(); clearInterval(forecastTimer); clearInterval(mapTimer); audio.pause(); audio.removeAttribute('src'); audio.load(); source?.disconnect(); context?.close(); }, { once: true });
})();
