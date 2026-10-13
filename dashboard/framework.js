(() => {
  const el = (tag, className, text) => { const n = document.createElement(tag); n.className = className; if (text) n.textContent = text; return n; };
  function mount(id, title) {
    const root = el('main', 'echo-console'); root.id = 'echo-console'; root.dataset.module = id;
    const header = el('header', 'echo-header'), brand = el('div', 'echo-brand', 'RADIO HUB // RECEIVER ARRAY');
    const heading = el('h1', 'echo-title', title); header.append(brand, heading);
    const nav = el('nav', 'echo-tabs'); nav.setAttribute('aria-label', 'Receiver array');
    for (const [key, label, icon, file] of [['hf','HF / SDR','radio-tower','hf.html'],['noaa','NOAA','cloud-sun','noaa.html'],['radio','AM/FM','radio','radio.html']]) {
      const link = el('a', '', label); link.href = file; if (key === id) link.setAttribute('aria-current', 'page');
      const mark = el('i', ''); mark.dataset.lucide = icon; link.prepend(mark); nav.append(link);
    }
    const grid = el('div', 'echo-grid'), left = el('aside','echo-left'), center = el('section','echo-center'), right = el('aside','echo-right');
    left.setAttribute('aria-label','Source and controls'); center.setAttribute('aria-label','Main activity'); right.setAttribute('aria-label','Analytics and metadata');
    grid.append(left, center, right);
    const footer = el('footer','echo-footer'), connection = el('span','echo-connection','Ready'), source = el('span','echo-source','No source selected'), system = el('span','echo-system','Radio Hub');
    footer.append(connection,source,system); root.append(header,nav,grid,footer); document.body.prepend(root);
    lucide.createIcons();
    return { root,left,center,right,footer,connection,source,system };
  }
  function heading(parent, text) { const n=el('h2','echo-section-title',text); parent.append(n); return n; }
  function audioModes(parent) {
    const group = el('div','echo-modes'); group.setAttribute('role','group'); group.setAttribute('aria-label','Audio visualization');
    for (const [mode,label] of [['spectrum','Spectrum'],['waveform','Waveform']]) {
      const button=el('button','',label); button.type='button'; button.setAttribute('aria-pressed',mode==='spectrum');
      button.addEventListener('click',()=>{ for(const b of group.children)b.setAttribute('aria-pressed',b===button); window.dispatchEvent(new CustomEvent('echo-audio-mode',{detail:mode})); }); group.append(button);
    }
    parent.append(group);
  }
  function audioAnalytics(shell) {
    heading(shell.right,'AUDIO METRICS');
    const rms=el('div',''),peak=el('div',''),metadata=el('div',''); shell.right.append(rms,peak,metadata);
    const metric=(container,label,value)=>EchoDashboard.metric(container,{label,value,unit:'dBFS',min:-100,max:0,source:'Audio analyser',observedAt:new Date().toISOString(),maxAgeMs:3000,reason:'No analysable audio'});
    metric(rms,'Audio level',null); metric(peak,'Audio peak',null);
    const onMetrics=e=>{metric(rms,'Audio level',e.detail.rms);metric(peak,'Audio peak',e.detail.peak);};
    const onSource=e=>{EchoDashboard.metadata(metadata,e.detail);shell.source.textContent=e.detail.Station||e.detail.Source||'No source selected';};
    window.addEventListener('echo-audio-metrics',onMetrics); window.addEventListener('echo-source',onSource);
    let lastState='';
    const timer=setInterval(()=>{
      const audio=document.getElementById('audio');
      const state=!audio?.getAttribute('src')?'No source':audio.error?'Unavailable':audio.paused?'Paused':audio.readyState<3?'Buffering':'Playing';
      if(state!==lastState){EchoDashboard.status(shell.connection,state==='Playing'?'live':state==='Unavailable'?'error':'unavailable',state);lastState=state;}
    },500);
    window.addEventListener('beforeunload',()=>{clearInterval(timer);window.removeEventListener('echo-audio-metrics',onMetrics);window.removeEventListener('echo-source',onSource);},{once:true});
  }
  function tabs(id) {
    const nav=el('nav','echo-tabs');nav.setAttribute('aria-label','Receiver array');
    for(const [key,label,icon] of [['hf','HF / SDR','radio-tower'],['noaa','NOAA','cloud-sun'],['radio','AM/FM','radio']]) {
      const link=el('a','',label);link.href=key+'.html';if(key===id)link.setAttribute('aria-current','page');
      const mark=el('i','');mark.dataset.lucide=icon;link.prepend(mark);nav.append(link);
    }
    const clock=el('time','echo-clock'),date=el('span','echo-clock-date'),time=el('span','echo-clock-time');
    clock.append(date,time);nav.append(clock);
    const dateFormat=new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'});
    const timeFormat=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'});
    function tick(){
      const now=new Date();clock.dateTime=now.toISOString();
      date.textContent=dateFormat.format(now);time.textContent=timeFormat.format(now);
      clock.setAttribute('aria-label',date.textContent+' '+time.textContent);
    }
    tick();const timer=setInterval(tick,1000);
    window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true});
    return nav;
  }
  window.EchoFramework={mount,heading,audioModes,audioAnalytics,tabs};
})();
