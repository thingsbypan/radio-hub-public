(() => {
  const $ = id => document.getElementById(id);
  const country = $('country'), region = $('region'), search = $('search');
  let audio = $('audio'), context, source, analyser, bins;
  const canvas = $('audio-spectrum'), paint = canvas.getContext('2d');
  const servers = ['https://all.api.radio-browser.info', 'https://de2.api.radio-browser.info'];
  const pageSize = 50;
  const usStates = 'Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|District of Columbia|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|Puerto Rico|Guam|U.S. Virgin Islands'.split('|');
  let countries = [], stations = [], selected, hls, offset = 0, more = false;
  let favoriteView = false, requestId = 0, regionRequestId = 0, playId = 0, playbackTimer;
  let favorites = read('radioFavorites', {});
  let defaultRegion = read('radioDefaultRegion', null);
  if (!favorites || Array.isArray(favorites) || typeof favorites !== 'object') favorites = {};
  if (!defaultRegion || typeof defaultRegion.country !== 'string' || typeof defaultRegion.region !== 'string') defaultRegion = null;

  function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; } }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } }
  function icons() { lucide.createIcons({ attrs: { 'aria-hidden': 'true' } }); }
  function safeUrl(value) { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch (_) { return ''; } }
  function countryName(code) {
    if (!code) return 'Worldwide';
    try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code); } catch (_) { return code; }
  }
  function option(value, text) { return new Option(text, value); }
  function showDefault() {
    $('default-label').textContent = defaultRegion ? `Default: ${[defaultRegion.region, countryName(defaultRegion.country)].filter(Boolean).join(', ')}` : 'Default region not saved';
  }
  async function api(endpoint) {
    let lastError;
    for (const server of servers) {
      try {
        const response = await fetch(server + endpoint, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error(`Directory returned ${response.status}`);
        const result = await response.json();
        if (!Array.isArray(result)) throw new Error('Unexpected directory response');
        return result;
      } catch (error) { lastError = error; }
    }
    throw lastError;
  }
  async function loadRegions(wanted = '') {
    const id = ++regionRequestId;
    const code = country.value;
    region.replaceChildren(option('', 'All regions'));
    region.disabled = true;
    $('save-default').disabled = true;
    let names = [];
    if (code === 'US') names = usStates;
    else if (code) {
      const entry = countries.find(item => item.iso_3166_1 === code);
      if (entry) {
        try {
          const data = await api(`/json/states/${encodeURIComponent(entry.name)}/?hidebroken=true`);
          names = [...new Set(data.map(item => item.name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
        } catch (_) {
          if (id === regionRequestId) $('results-status').textContent = 'Regions unavailable; country search is still available.';
        }
      }
    }
    if (id !== regionRequestId) return false;
    for (const name of names) region.add(option(name, code === 'US' && name === 'Georgia' ? 'Georgia (GA)' : name));
    if (wanted && !names.includes(wanted)) region.add(option(wanted, wanted));
    region.value = wanted;
    region.disabled = !code;
    $('save-default').disabled = false;
    return true;
  }
  function normalize(item) {
    return { id: item.stationuuid, name: String(item.name || 'Unnamed station').trim(),
      url: safeUrl(item.url_resolved || item.url), logo: safeUrl(item.favicon),
      state: String(item.state || '').trim(), country: item.countrycode || '',
      tags: String(item.tags || ''), codec: String(item.codec || ''), bitrate: Number(item.bitrate) || 0,
      hls: Boolean(item.hls) };
  }
  function logo(container, item) {
    container.replaceChildren();
    const fallback = document.createElement('span');
    fallback.textContent = item.name.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || 'FM';
    container.append(fallback);
    if (item.logo) {
      const image = new Image(); image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
      image.addEventListener('load', () => { fallback.hidden = true; });
      image.addEventListener('error', () => { image.remove(); fallback.hidden = false; });
      image.src = item.logo; container.append(image);
    }
  }
  function iconButton(icon, label) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'icon-button';
    button.title = label; button.setAttribute('aria-label', label);
    const mark = document.createElement('i'); mark.dataset.lucide = icon; button.append(mark); return button;
  }
  function location(item) { return [item.state, countryName(item.country)].filter(Boolean).join(', '); }
  function render() {
    const list = $('station-list'); list.replaceChildren();
    const visible = favoriteView ? Object.values(favorites).filter(item =>
      (!country.value || item.country === country.value) && (!region.value || item.state.toLowerCase().includes(region.value.toLowerCase())) &&
      item.name.toLowerCase().includes(search.value.trim().toLowerCase())) : stations;
    for (const item of visible) {
      const row = document.createElement('div'); row.className = 'station-row'; row.setAttribute('role', 'listitem'); row.dataset.id = item.id;
      row.classList.toggle('active', selected?.id === item.id);
      const play = iconButton('play', `Play ${item.name}`); play.addEventListener('click', () => start(item));
      const picture = document.createElement('div'); picture.className = 'logo'; logo(picture, item);
      const name = document.createElement('div'); name.className = 'station-name'; name.textContent = item.name;
      const place = document.createElement('div'); place.className = 'station-detail'; place.textContent = location(item);
      const details = document.createElement('div'); details.className = 'station-detail';
      details.textContent = [item.tags.split(',').filter(Boolean).slice(0, 3).join(' / '), [item.codec, item.bitrate ? `${item.bitrate} kbps` : ''].filter(Boolean).join(' ')].filter(Boolean).join(' - ');
      const star = iconButton('star', favorites[item.id] ? `Remove ${item.name} from favorites` : `Favorite ${item.name}`);
      star.classList.add('favorite'); star.setAttribute('aria-pressed', Boolean(favorites[item.id]));
      star.addEventListener('click', () => {
        if (favorites[item.id]) delete favorites[item.id]; else favorites[item.id] = item;
        if (!save('radioFavorites', favorites)) $('results-status').textContent = 'Favorites could not be saved.';
        render();
      });
      row.append(play, picture, name, place, details, star); list.append(row);
    }
    $('empty').hidden = visible.length > 0;
    $('empty').textContent = favoriteView ? 'No favorites match this region and search.' : 'No stations found for this region and search.';
    $('results-status').textContent = `${visible.length}${!favoriteView && more ? '+' : ''} ${favoriteView ? 'favorites' : 'stations'}`;
    $('load-more').hidden = favoriteView || !more;
    icons();
  }
  async function findStations(append = false) {
    const id = ++requestId;
    $('retry-directory').hidden = true;
    $('load-more').hidden = true;
    if (favoriteView) { render(); return; }
    if (!append) { offset = 0; stations = []; $('station-list').replaceChildren(); }
    $('empty').hidden = true; $('results-status').textContent = 'Searching stations...';
    const params = new URLSearchParams({ hidebroken: 'true', order: 'clickcount', reverse: 'true', limit: String(pageSize), offset: String(offset) });
    if (country.value) params.set('countrycode', country.value);
    if (region.value) params.set('state', region.value);
    if (search.value.trim()) params.set('name', search.value.trim());
    try {
      const result = await api(`/json/stations/search?${params}`);
      if (id !== requestId) return;
      more = result.length === pageSize; offset += result.length;
      const known = new Set(stations.map(item => item.id));
      for (const raw of result) {
        const item = normalize(raw);
        if (item.id && item.url && !known.has(item.id)) { stations.push(item); known.add(item.id); }
      }
      render();
    } catch (_) {
      if (id !== requestId) return;
      $('results-status').textContent = 'Directory unavailable';
      $('empty').textContent = 'The directory did not respond. Saved favorites are still available.';
      $('empty').hidden = false; $('retry-directory').hidden = false;
    }
  }
  function playbackStatus(text) { $('playback-status').textContent = text; }
  function audioButtons() {
    for (const [id, icon, label] of [
      ['audio-toggle', audio.paused ? 'play' : 'pause', audio.paused ? 'Play audio' : 'Pause audio'],
      ['audio-mute', audio.muted || !audio.volume ? 'volume-x' : 'volume-2', audio.muted ? 'Unmute audio' : 'Mute audio'],
    ]) {
      const mark = document.createElement('i'); mark.dataset.lucide = icon;
      $(id).replaceChildren(mark); $(id).title = label; $(id).setAttribute('aria-label', label);
    }
    $('audio-mute').setAttribute('aria-pressed', audio.muted); icons();
  }
  async function connectGraph() {
    if (!audio.crossOrigin) return;
    context ||= new AudioContext();
    if (!source) {
      analyser = context.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = .75;
      bins = new Uint8Array(analyser.frequencyBinCount);
      source = context.createMediaElementSource(audio); source.connect(analyser); analyser.connect(context.destination);
    }
    await context.resume();
  }
  const graph = EchoDashboard.audioPlot($('audio-spectrum'), $('audio-plot-status'), () => ({ audio, analyser, context }));
  function failed(message) {
    clearTimeout(playbackTimer); audio.pause(); hls?.stopLoad();
    $('playback-error').textContent = message; $('playback-error').hidden = false; playbackStatus('Unavailable');
  }
  function timeout() { clearTimeout(playbackTimer); playbackTimer = setTimeout(() => failed('The station is not responding. Reconnect or choose another station.'), 25000); }
  async function start(item, plainAudio = false) {
    const id = ++playId;
    clearTimeout(playbackTimer); hls?.destroy(); hls = undefined;
    audio.pause(); audio.removeAttribute('src'); audio.load();
    window.EchoCatchAudio?.detach(); source?.disconnect(); analyser?.disconnect(); source = undefined; analyser = undefined;
    // Recreate the element so non-CORS relays can fall back to ordinary playback.
    const previous = audio, next = document.createElement('audio');
    next.id = 'audio'; next.hidden = true; next.preload = 'none'; next.volume = previous.volume; next.muted = previous.muted;
    if (!plainAudio) next.crossOrigin = 'anonymous';
    previous.replaceWith(next); audio = next; bindAudio(next, plainAudio);
    window.dispatchEvent(new CustomEvent('echo-source', { detail: { Station: item.name, Location: location(item), Codec: item.codec || 'Unknown', 'Listed bitrate': item.bitrate ? `${item.bitrate} kbps` : 'Unknown', 'Stream quality': 'Playback state and decoded audio only' } }));
    selected = item; $('playback-error').hidden = true; $('reconnect').disabled = false;
    $('audio-toggle').disabled = false; audioButtons();
    $('now-name').textContent = item.name; $('now-location').textContent = location(item); logo($('now-logo'), item);
    playbackStatus('Connecting'); timeout();
    for (const row of document.querySelectorAll('.station-row')) row.classList.toggle('active', row.dataset.id === item.id);
    try {
      if ((item.hls || /\.m3u8(?:\?|$)/i.test(item.url)) && !audio.canPlayType('application/vnd.apple.mpegurl')) {
        if (!Hls.isSupported()) throw new Error('HLS unsupported');
        hls = new Hls({ enableWorker: true });
        hls.on(Hls.Events.ERROR, (_event, data) => { if (id === playId && data.fatal) failed('This stream cannot play here. Reconnect or choose another station.'); });
        hls.loadSource(item.url); hls.attachMedia(audio);
      } else audio.src = item.url;
      await connectGraph();
      if (id !== playId) return;
      await audio.play();
      if (id !== playId) return;
      // Radio Browser asks clients to count an actual station selection once playback starts.
      fetch(`${servers[0]}/json/url/${encodeURIComponent(item.id)}`, { signal: AbortSignal.timeout(5000) }).catch(() => {});
    } catch (error) {
      if (id !== playId || error.name === 'AbortError') return;
      if (error.name === 'NotAllowedError') { clearTimeout(playbackTimer); playbackStatus('Ready - press play'); }
      else failed('This stream cannot play here. It may be offline, restricted, or use an unsupported format.');
    }
  }
  $('reconnect').addEventListener('click', () => { if (selected) start(selected); });
  function bindAudio(element, plainAudio) {
    const on = (event, handler) => element.addEventListener(event, () => { if (element === audio) handler(); });
    on('play', () => { $('playback-error').hidden = true; playbackStatus('Connecting'); timeout(); audioButtons(); });
    on('playing', () => { clearTimeout(playbackTimer); $('playback-error').hidden = true; playbackStatus('Playing'); audioButtons(); });
    on('pause', () => { if (audio.paused) { clearTimeout(playbackTimer); if ($('playback-error').hidden) playbackStatus('Paused'); audioButtons(); } });
    on('waiting', () => { if (!audio.paused) { playbackStatus('Buffering'); timeout(); } });
    on('error', () => {
      if (!selected || !audio.getAttribute('src')) return;
      if (!plainAudio && !hls) { start(selected, true); return; }
      failed('This stream cannot play here. Reconnect or choose another station.');
    });
  }
  $('audio-toggle').addEventListener('click', async () => {
    if (!audio.paused) { audio.pause(); return; }
    const id = playId;
    try { await connectGraph(); if (id === playId) await audio.play(); }
    catch (e) { if (id === playId && e.name !== 'AbortError') failed('Audio could not resume. Try Reconnect.'); }
  });
  $('audio-mute').addEventListener('click', () => { audio.muted = !audio.muted; audioButtons(); });
  $('audio-volume').addEventListener('input', () => { audio.volume = Number($('audio-volume').value); audio.muted = false; audioButtons(); });
  $('filters').addEventListener('submit', event => { event.preventDefault(); findStations(); });
  country.addEventListener('change', async () => { ++requestId; if (await loadRegions()) findStations(); });
  region.addEventListener('change', () => findStations());
  $('load-more').addEventListener('click', () => findStations(true));
  $('retry-directory').addEventListener('click', () => initialize());
  $('save-default').addEventListener('click', () => {
    const value = { country: country.value, region: region.value };
    if (save('radioDefaultRegion', value)) { defaultRegion = value; showDefault(); }
    else $('default-label').textContent = 'Could not save default region';
  });
  for (const [id, value] of [['browse', false], ['favorites', true]]) $(id).addEventListener('click', () => {
    favoriteView = value; $('browse').setAttribute('aria-pressed', !value); $('favorites').setAttribute('aria-pressed', value); findStations();
  });
  async function initialize() {
    const initial = defaultRegion || { country: 'US', region: 'Georgia' };
    country.disabled = true;
    $('retry-directory').hidden = true;
    $('results-status').textContent = 'Loading directory...';
    try {
      countries = await api('/json/countries?hidebroken=true');
      country.replaceChildren(option('', 'Worldwide'));
      for (const item of countries.sort((a, b) => countryName(a.iso_3166_1).localeCompare(countryName(b.iso_3166_1)))) country.add(option(item.iso_3166_1, countryName(item.iso_3166_1)));
      country.value = initial.country;
      await loadRegions(initial.region);
      await findStations();
    } catch (_) {
      country.value = 'US'; await loadRegions(initial.country === 'US' ? initial.region : '');
      $('results-status').textContent = 'Directory unavailable'; $('empty').hidden = false;
      $('empty').textContent = 'The directory did not respond. Saved favorites are still available.'; $('retry-directory').hidden = false;
    } finally { country.disabled = false; }
  }

  window.echoCatchMetadata = () => ({frequency:null,frequency_unit:null,frequency_khz:null,mode:null,receiver:selected?.name || null,receiver_id:selected?.stationuuid || null,receiver_location:selected ? location(selected) : null,source_url:selected?.url || null,filter_width_hz:null,signal_dbm:null,snr_db:null,active_band:null});

  const catchTapTimer=setInterval(() => {
    const m=window.echoCatchMetadata();
    window.EchoCatchAudio?.attach(source,JSON.stringify([m.receiver_id,m.receiver,m.source_url]),()=>!audio.paused && audio.readyState>=3);
  },100);
  window.addEventListener('beforeunload',()=>clearInterval(catchTapTimer),{once:true});
  audio.volume = .6;
  logo($('now-logo'), { name: 'Radio', logo: '' }); icons(); showDefault(); initialize();
  window.addEventListener('beforeunload', () => { ++requestId; ++playId; clearTimeout(playbackTimer); graph.destroy(); hls?.destroy(); audio.pause(); audio.removeAttribute('src'); audio.load(); source?.disconnect(); context?.close(); }, { once: true });
})();
