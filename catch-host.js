const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { RollingAudio, pcm, wavHeader, summary, zip, atomic } = require('./catch-core');
module.exports = function catchHost(window, hf) {
  const root = path.join(app.getPath('documents'), 'Echo Base', 'Radio Catches');
  const ring = new RollingAudio(); let active, library, localKey, hfBusy = false, starting = false;
  fs.mkdirSync(root, { recursive: true });
  // Recover interrupted sessions honestly; the WAV header is checkpointed on each append.
  for (const id of fs.readdirSync(root).filter(id=>/^RadioCatch_[a-zA-Z0-9_.-]+$/.test(id))) {
    try { const dir=path.join(root,id);if(fs.lstatSync(dir).isSymbolicLink())continue;
      const file=path.join(dir,'metadata.json'),m=JSON.parse(fs.readFileSync(file,'utf8'));
      if(m.capture_status==='recording' || m.screenshot_status==='pending'){
        if(m.capture_status==='recording'){
          const fd=fs.openSync(path.join(dir,'audio.wav'),'r'),header=Buffer.alloc(44);try{fs.readSync(fd,header,0,44,0);}finally{fs.closeSync(fd);}
          m.audio_duration_seconds=header.readUInt32LE(40)/(header.readUInt32LE(24)*2);
          m.capture_status='partial';m.audio_status=m.audio_duration_seconds?'saved':'unavailable';m.warnings.push('Radio Hub stopped during recording; recovered saved audio.');
        }
        if(m.screenshot_status==='pending'){m.screenshot_status=fs.existsSync(path.join(dir,'waterfall.png'))?'saved':'unavailable';m.warnings.push('Screenshot capture was interrupted.');}
        atomic(file,JSON.stringify(m,null,2));atomic(path.join(dir,'summary.txt'),summary(m,fs.readFileSync(path.join(dir,'notes.txt'),'utf8')));
      }
    }catch(_){}
  }
  const urls = ['hf.html', 'radio.html', 'noaa.html', 'catch-library.html'].map(f => pathToFileURL(path.join(__dirname, f)).href);
  const allowed = e => [window.webContents, library?.webContents].includes(e.sender) && e.senderFrame === e.sender.mainFrame && urls.includes(e.senderFrame.url);
  const fail = e => { if (!allowed(e)) throw Error('Invalid catch sender'); };
  function folder(id) {
    if (typeof id !== 'string' || !/^RadioCatch_[a-zA-Z0-9_.-]+$/.test(id)) throw Error('Invalid catch ID');
    const f = path.join(root, id); if (fs.lstatSync(f).isSymbolicLink() || !fs.statSync(f).isDirectory()) throw Error('Invalid catch folder'); return f;
  }
  function notify(data) { for (const w of [window, library]) if (w && !w.isDestroyed()) w.webContents.send('catch:status', data); }
  function persist(c) {
    c.metadata.audio_duration_seconds = c.samples / c.rate;
    atomic(path.join(c.dir, 'metadata.json'), JSON.stringify(c.metadata, null, 2));
    atomic(path.join(c.dir, 'summary.txt'), summary(c.metadata, fs.readFileSync(path.join(c.dir,'notes.txt'),'utf8')));
  }
  function append(c, samples) {
    const fd = fs.openSync(path.join(c.dir, 'audio.wav'), 'r+');
    try { fs.writeSync(fd, pcm(samples), 0, samples.length * 2, 44 + c.samples * 2); c.samples += samples.length; fs.writeSync(fd, wavHeader(c.samples, c.rate), 0, 44, 0); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
  }
  function finish(reason) {
    if (!active) return; const c = active; active = null; clearTimeout(c.timer);
    c.metadata.capture_status = reason ? 'partial' : 'complete';
    if (reason) c.metadata.warnings.push(reason);
    c.metadata.audio_status = c.samples ? 'saved' : 'unavailable';
    if (!c.samples) c.metadata.warnings.push('No capturable audio. The WAV contains no samples.');
    try { persist(c); notify({ state: 'saved', id: c.id, metadata: c.metadata }); }
    catch(e) { console.error('Catch finalization:',e.message);notify({state:'error',message:`Audio preserved where possible; catch metadata could not be saved: ${e.message}`}); }
  }
  function ingest(data, key) {
    if (!data || !Number.isInteger(data.rate) || data.rate < 8000 || data.rate > 192000 || !Array.isArray(data.chunks)) return;
    if(active && active.key===key && !active.samples && active.rate!==data.rate){active.rate=data.rate;active.metadata.audio_sample_rate_hz=data.rate;active.postLimit=data.rate*12;}
    if (active && (active.key !== key || active.rate !== data.rate)) finish('Source, tuning or sample rate changed; recording stopped at the change.');
    for (const chunk of data.chunks.slice(0, 400)) {
      if (!Array.isArray(chunk) || chunk.length > 16384 || !chunk.every(v => Number.isFinite(v) && Math.abs(v) <= 10)) continue;
      ring.push(chunk, data.rate, key);
      if (active) { try { const remaining=Math.max(0,active.postLimit-active.samples);if(remaining)append(active,chunk.slice(0,remaining));if(active.samples>=active.postLimit)finish(); } catch (e) { finish(`Audio write failed: ${e.message}`); } }
    }
    if (active) { try { persist(active); } catch(e) { notify({state:'error',message:`Catch write failed: ${e.message}`});finish(`Storage error: ${e.message}`); } }
  }
  async function pollHF() {
    if (hfBusy || !hf.catchTarget()) return;
    hfBusy = true;
    try { const target = hf.catchTarget(), data = await target.contents.executeJavaScript('window.echoCatchRead?.()');
      if (data && hf.catchTarget()?.contents === target.contents) ingest(data, `hf:${target.id}:${data.key}`);
    } catch (_) {} finally { hfBusy = false; }
  }
  const timer = setInterval(pollHF, 250);
  const localAudio = (e, data) => { if (allowed(e) && e.sender === window.webContents && !hf.catchTarget() && data) { localKey = `${e.senderFrame.url}:${data.key}`; ingest(data, localKey); } };
  ipcMain.on('catch:audio', localAudio);
  function handle(name, fn) { ipcMain.handle(`catch:${name}`, (e, ...args) => { fail(e); return fn(e, ...args); }); }
  handle('buffer', () => ({seconds:ring.rate?ring.snapshot().reduce((n,c)=>n+c.length,0)/ring.rate:0}));
  handle('start', async e => {
    if (e.sender !== window.webContents) throw Error('Use LOG CATCH on the receiver');
    if (active) return { id: active.id, metadata: active.metadata };
    if (starting) throw Error('Capture is starting'); starting=true;
    try {
    const now = new Date(), target = hf.catchTarget(), pageURL=window.webContents.getURL(); let m = {}, warning = [], currentKey = target && ring.key?.startsWith(`hf:${target.id}:`) ? ring.key : localKey;
    const withTimeout = promise => Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(Error('Receiver did not respond in time')),1500))]);
    const imagePromise=(target?.contents || window.webContents).capturePage(undefined,{stayHidden:true,stayAwake:true});imagePromise.catch(()=>{});
    try { if (target) { const data = await withTimeout(target.contents.executeJavaScript('window.echoCatchRead?.()')); if (data) { m = data.metadata; currentKey=`hf:${target.id}:${data.key}`; ingest(data, currentKey); } else {currentKey=null;warning.push('Audio and tuning adapter unavailable for this receiver.');} }
      else {m = await withTimeout(window.webContents.executeJavaScript('window.echoCatchMetadata?.() || {}'));currentKey=`${window.webContents.getURL()}:${JSON.stringify([m.receiver_id,m.receiver,m.source_url])}`;}
    } catch (err) { warning.push(`Metadata unavailable: ${err.message}`); }
    if(window.isDestroyed() || window.webContents.getURL()!==pageURL || hf.catchTarget()?.contents!==target?.contents)throw Error('Receiver changed while the catch was starting; press LOG CATCH again.');
    const finite = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
    const text = v => typeof v === 'string' && v ? v.slice(0, 500) : null;
    const chunks = currentKey === ring.key ? ring.snapshot() : [], rate = ring.rate || 48000;
    const local = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const id = `RadioCatch_${local}_${finite(m.frequency) ?? 'unknown'}${text(m.frequency_unit)?.replace(/[^a-zA-Z]/g,'') || ''}_${now.toISOString().slice(11,23).replace(/[:.]/g,'-')}_${require('node:crypto').randomBytes(3).toString('hex')}`;
    const dir = path.join(root, id); fs.mkdirSync(dir);
    const offset = -now.getTimezoneOffset(), sign = offset >= 0 ? '+' : '-', pad = n => String(n).padStart(2,'0');
    const timestampLocal = `${local}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${sign}${pad(Math.floor(Math.abs(offset)/60))}:${pad(Math.abs(offset)%60)}`;
    const metadata = { schema_version: 1, timestamp_local: timestampLocal, timestamp_utc: now.toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      frequency: finite(m.frequency), frequency_unit: text(m.frequency_unit), frequency_khz: finite(m.frequency_khz), mode: text(m.mode),
      receiver: target?.label || text(m.receiver), receiver_id: target?.id || text(m.receiver_id), source_url: target?.url || text(m.source_url),
      receiver_location: target?.location || text(m.receiver_location), filter_width_hz: finite(m.filter_width_hz), active_band: text(m.active_band), signal_dbm: finite(m.signal_dbm), snr_db: finite(m.snr_db),
      echo_base_version: require('./package.json').version, audio_format: 'PCM16 mono WAV', audio_sample_rate_hz: rate, requested_pre_seconds: 30, requested_post_seconds: 12,
      pre_capture_seconds: chunks.reduce((n,c)=>n+c.length,0)/rate, audio_duration_seconds: 0, audio_status: 'recording', screenshot_status: 'pending', capture_status: 'recording', warnings: warning };
    const c = { id, dir, metadata, key: currentKey, samples: 0, rate, note: '' };
    fs.writeFileSync(path.join(dir, 'audio.wav'), wavHeader(0, rate));
    fs.writeFileSync(path.join(dir, 'notes.txt'), '');
    if(chunks.length){const pre=new Float32Array(chunks.reduce((n,a)=>n+a.length,0));let offset=0;for(const chunk of chunks){pre.set(chunk,offset);offset+=chunk.length;}append(c,pre);}
    persist(c); active = c;
    c.postLimit=c.samples+rate*12;
    c.timer = setTimeout(() => finish(), 12000);
    // Save screenshot independently; audio remains safe if this fails.
    withTimeout(imagePromise).then(img => { if (img.isEmpty()) throw Error('Empty screenshot'); fs.writeFileSync(path.join(dir,'waterfall.png'), img.toPNG()); metadata.screenshot_status = 'saved';metadata.screenshot_method='native';metadata.screenshot_timestamp_utc=now.toISOString(); })
      .catch(async err => {
        if(!target || target.contents.isDestroyed())throw err;
        const script=`window.echoCatchScreenshotMetadata=${JSON.stringify(metadata)};\n${fs.readFileSync(path.join(__dirname,'catch-screenshot.js'),'utf8')}`;
        const result=await withTimeout(target.contents.executeJavaScript(script));
        fs.writeFileSync(path.join(dir,'waterfall.png'),Buffer.from(result.data,'base64'));
        metadata.screenshot_status='saved';metadata.screenshot_method='receiver-canvases';metadata.screenshot_timestamp_utc=result.captured_at;
        metadata.warnings.push(`Native screenshot unavailable; saved real receiver canvases with context instead: ${err.message}`);
      })
      .catch(err => { metadata.screenshot_status = 'unavailable'; metadata.warnings.push(`Screenshot unavailable: ${err.message}`); })
      .finally(() => { try { persist(c);notify({state:'updated',id:c.id}); } catch (err) { console.error('Catch screenshot:', err.message); } });
    notify({ state: 'recording', id, metadata }); return { id, metadata };
    } finally { starting=false; }
  });
  handle('note', (_e, id, note) => {
    if (typeof note !== 'string' || note.length > 2000) throw Error('Note too long'); const dir = folder(id);
    atomic(path.join(dir,'notes.txt'), note);
    if (active?.id === id) { active.note = note; persist(active); }
    else { const m = JSON.parse(fs.readFileSync(path.join(dir,'metadata.json'),'utf8')); atomic(path.join(dir,'summary.txt'),summary(m,note)); }
    return true;
  });
  handle('list', () => fs.readdirSync(root).filter(id => /^RadioCatch_/.test(id)).flatMap(id => {
    try { const dir = folder(id); return [{ id, metadata: JSON.parse(fs.readFileSync(path.join(dir,'metadata.json'),'utf8')), note: fs.readFileSync(path.join(dir,'notes.txt'),'utf8'), active: active?.id === id }]; } catch (_) { return []; }
  }).sort((a,b)=>b.metadata.timestamp_utc.localeCompare(a.metadata.timestamp_utc)));
  handle('audioFile', (_e,id) => { const file=path.join(folder(id),'audio.wav'); if(fs.statSync(file).size>40*1024*1024)throw Error('Audio too large'); return fs.readFileSync(file); });
  handle('screenshot', (_e,id) => shell.openPath(path.join(folder(id),'waterfall.png')));
  handle('reveal', (_e,id) => { if (id) shell.showItemInFolder(path.join(folder(id),'metadata.json')); else shell.openPath(root); });
  handle('delete', async (e,id) => { if(active?.id===id)throw Error('Capture still recording'); const dir=folder(id);
    const answer=await dialog.showMessageBox(BrowserWindow.fromWebContents(e.sender),{type:'question',buttons:['Cancel','Move to Recycle Bin'],defaultId:0,cancelId:0,message:'Delete this catch?',detail:id});
    if(answer.response===1){await shell.trashItem(dir);return true;} return false;
  });
  handle('export', async (_e,id) => {
    if(active?.id===id)throw Error('Wait for recording to finish'); const dir=folder(id);
    const m=JSON.parse(fs.readFileSync(path.join(dir,'metadata.json'),'utf8')); if(m.screenshot_status==='pending')throw Error('Screenshot is still saving');
    const entries=['audio.wav','waterfall.png','metadata.json','notes.txt','summary.txt'].filter(f=>fs.existsSync(path.join(dir,f))).map(f=>({name:`${id}/${f}`,data:fs.readFileSync(path.join(dir,f))}));
    const dest=path.join(root,`${id}.zip`); atomic(dest,zip(entries)); shell.showItemInFolder(dest);return dest;
  });
  handle('library', () => {
    if(library&&!library.isDestroyed()){library.show();library.focus();return;}
    library=new BrowserWindow({show:!window.webContents.isOffscreen(),width:1000,height:740,title:'Radio Hub — Catch Library',backgroundColor:'#080808',webPreferences:{offscreen:window.webContents.isOffscreen(),nodeIntegration:false,contextIsolation:true,sandbox:true,preload:path.join(__dirname,'preload.js')}});
    library.setMenu(null); library.loadFile(path.join(__dirname,'catch-library.html')).catch(error=>notify({state:'error',message:`Catch Library: ${error.message}`})); library.on('closed',()=>{library=null;});
  });
  window.webContents.on('did-start-navigation',(_e,_url,inPlace,main)=>{if(main&&!inPlace){finish('Receiver page changed; saved audio up to navigation.');ring.reset();localKey=null;}});
  window.on('close',()=>finish('Radio Hub closed before the post-capture period finished.'));
  window.on('closed',()=>{clearInterval(timer);library?.close();ipcMain.removeListener('catch:audio',localAudio);for(const n of ['buffer','start','note','list','audioFile','screenshot','reveal','delete','export','library'])ipcMain.removeHandler(`catch:${n}`);});
  return { sourceChanged() { finish('Receiver changed; saved audio up to the change.'); ring.reset(); } };
};
