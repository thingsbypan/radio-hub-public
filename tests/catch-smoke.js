// Run with Electron. All captures go to a temporary Documents directory.
const {app,BrowserWindow,shell}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'echo-catch-smoke-'));
app.setPath('documents',tmp);app.setPath('userData',path.join(tmp,'profile'));shell.showItemInFolder=()=>{};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
  let w;
  try {
    w=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,preload:path.join(__dirname,'../preload.js')}});
    const recoveryDir=path.join(tmp,'Echo Base','Radio Catches','RadioCatch_recovery');fs.mkdirSync(recoveryDir,{recursive:true});
    const {wavHeader,pcm}=require('../catch-core');fs.writeFileSync(path.join(recoveryDir,'audio.wav'),Buffer.concat([wavHeader(800,8000),pcm(new Float32Array(800))]));
    fs.writeFileSync(path.join(recoveryDir,'metadata.json'),JSON.stringify({frequency:null,mode:null,receiver:null,timestamp_local:'2026-10-01T00:00:00-04:00',timestamp_utc:'2026-10-01T04:00:00Z',capture_status:'recording',screenshot_status:'pending',audio_duration_seconds:0,pre_capture_seconds:0,warnings:[]}));fs.writeFileSync(path.join(recoveryDir,'notes.txt'),'Recovered note');
    const hf={catchTarget:()=>null};const host=require('../catch-host')(w,hf);
    const recovered=JSON.parse(fs.readFileSync(path.join(recoveryDir,'metadata.json'),'utf8'));assert.equal(recovered.capture_status,'partial');assert.equal(recovered.audio_duration_seconds,.1);assert.equal(recovered.screenshot_status,'unavailable');
    w.webContents.on('console-message',(_e,details)=>{if(details.level==='error')console.log('Renderer:',details.message);});
    await w.loadFile(path.join(__dirname,'../radio.html'));await wait(500);
    const report=await w.webContents.executeJavaScript(`(async()=>{
      const m={frequency:15245,frequency_unit:'kHz',frequency_khz:15245,mode:'AM',receiver:'Synthetic test source',receiver_id:'fixture',source_url:'test:fixture',receiver_location:null,filter_width_hz:8200,signal_dbm:null,snr_db:null,active_band:null};
      window.echoCatchMetadata=()=>m;
      const key=JSON.stringify([m.receiver_id,m.receiver,m.source_url]);
      echoCatch.audio({rate:48000,key,chunks:Array.from({length:360},()=>Array.from({length:4096},(_,i)=>Math.sin(i/20)*.25)),metadata:m});
      await new Promise(r=>setTimeout(r,100));
      const c=await echoCatch.start();await echoCatch.note(c.id,'Strange repeating beeps.');
      // Simulate live PCM delivery for the actual 12-second post window.
      const timer=setInterval(()=>echoCatch.audio({rate:48000,key,chunks:[Array.from({length:12000},(_,i)=>Math.sin(i/20)*.25)],metadata:m}),250);
      await new Promise(r=>setTimeout(r,12500));clearInterval(timer);
      const list=await echoCatch.list(),saved=list.find(x=>x.id===c.id),bytes=await echoCatch.audioFile(c.id);
      const zip=await echoCatch.export(c.id);return {saved,zip,bytes:bytes.length,button:!!document.querySelector('.catch-trigger')};
    })()`);
    const c=report.saved;assert.ok(report.button);assert.equal(c.metadata.pre_capture_seconds,30);assert.ok(c.metadata.audio_duration_seconds>=41&&c.metadata.audio_duration_seconds<=43);assert.equal(c.metadata.screenshot_status,'saved');assert.equal(c.note,'Strange repeating beeps.');assert.equal(c.metadata.signal_dbm,null);assert.equal(c.metadata.capture_status,'complete');
    const dir=path.join(tmp,'Echo Base','Radio Catches',c.id);assert.deepEqual(fs.readdirSync(dir).sort(),['audio.wav','metadata.json','notes.txt','summary.txt','waterfall.png']);
    const wav=fs.readFileSync(path.join(dir,'audio.wav'));assert.equal(wav.readUInt32LE(40),wav.length-44);assert.equal(report.bytes,wav.length);assert.match(fs.readFileSync(path.join(dir,'summary.txt'),'utf8'),/Strange repeating beeps/);
    fs.copyFileSync(path.join(dir,'waterfall.png'),path.join(tmp,'ui.png'));
    // Source change safely finalizes a partial catch without adding different audio.
    const partial=await w.webContents.executeJavaScript('echoCatch.start()');host.sourceChanged();
    const after=JSON.parse(fs.readFileSync(path.join(tmp,'Echo Base','Radio Catches',partial.id,'metadata.json'),'utf8'));assert.equal(after.capture_status,'partial');
    // Traversal and unknown IDs cannot read arbitrary local files.
    assert.equal(await w.webContents.executeJavaScript(`echoCatch.audioFile('../package.json').then(()=>false,()=>true)`),true);
    await w.webContents.executeJavaScript('echoCatch.library()');await wait(700);
    const lib=BrowserWindow.getAllWindows().find(x=>x!==w);assert.ok(lib);const state=await lib.webContents.executeJavaScript(`({rows:document.querySelectorAll('article').length,text:document.body.innerText})`);assert.equal(state.rows,3);assert.match(state.text,/EXPORT FOR RADIOBOT/);
    await lib.webContents.executeJavaScript(`document.querySelectorAll('article')[1].querySelector('button').click()`);await wait(500);
    assert.equal(await lib.webContents.executeJavaScript(`document.querySelector('audio')?.readyState>=2`),true);
    await wait(1000);try { fs.writeFileSync(path.join(tmp,'library.png'),(await lib.webContents.capturePage(undefined,{stayAwake:true})).toPNG()); } catch(e) { console.log('Library screenshot:',e.message); }
    // Verify the shared tap against real Web Audio, independent of internet relays.
    const tap=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true}});await tap.loadURL('about:blank');
    await tap.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'../catch-audio.js'),'utf8'));
    const audio=await tap.webContents.executeJavaScript(`(async()=>{const ctx=new AudioContext(),osc=ctx.createOscillator(),gain=ctx.createGain();gain.gain.value=.2;osc.connect(gain);gain.connect(ctx.destination);EchoCatchAudio.attach(gain,'test');osc.start();await ctx.resume();await new Promise(r=>setTimeout(r,1200));const data=EchoCatchAudio.drain();EchoCatchAudio.detach();osc.stop();await ctx.close();return {rate:data.rate,count:data.chunks.reduce((n,c)=>n+c.length,0),peak:Math.max(...data.chunks[0].map(Math.abs))};})()`,true);
    assert.ok(audio.count>audio.rate*.8);assert.ok(audio.peak>.1);tap.close();
    console.log(JSON.stringify({success:true,tmp,duration:c.metadata.audio_duration_seconds,zip:report.zip,audioTap:audio},null,2));
    w.close();app.quit();
  }catch(e){console.error(e);if(w&&!w.isDestroyed())w.close();app.exit(1);}
});
