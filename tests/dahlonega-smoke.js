const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'radio-dahlonega-'));
app.setPath('userData',path.join(tmp,'profile'));app.setPath('documents',tmp);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
  try{
    const w=new BrowserWindow({show:false,width:1280,height:720,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,preload:path.join(__dirname,'../preload.js')}});w.setMenu(null);
    const hf=require('../hf-host')(w),catches=require('../catch-host')(w,hf);hf.onCatchSourceChanged=()=>catches.sourceChanged();
    await w.loadFile(path.join(__dirname,'../hf.html'));
    await w.webContents.executeJavaScript(`echoHF.select('georgia')`);
    let target;
    for(let i=0;i<250;i++){await wait(100);target=hf.catchTarget();if(target&&await target.contents.executeJavaScript(`!!window.echoCatchRead && !!document.getElementById('audio-start-button') && !document.getElementById('audio-start-button').disabled`).catch(()=>false))break;}
    const remote=code=>target.contents.executeJavaScript(code,true);
    target.contents.setBackgroundThrottling(false);
    await wait(2000);
    const start=await remote(`(()=>{let e=document.getElementById('audio-start-button'),s=getComputedStyle(e);return {width:e.getBoundingClientRect().width,background:s.backgroundColor,radius:s.borderRadius,label:e.textContent.trim(),overlay:document.getElementById('audio-start-overlay').className}})()`);
    console.log('START',start,await remote(`({url:location.href,ready:window.echoDahlonegaReady,inline:document.getElementById('audio-start-button').style.cssText})`));assert.ok(start.width<=270);assert.equal(start.background,'rgb(48, 42, 32)');
    fs.writeFileSync('dist/dahlonega-start-final.png',(await target.contents.capturePage()).toPNG());
    await remote(`document.getElementById('audio-start-button').click()`);
    for(let i=0;i<150;i++){await wait(100);if(await remote(`window.audioContext?.state==='running' && document.getElementById('audio-start-overlay').classList.contains('hidden')`))break;}
    await wait(2500);
    const playback=await remote(`({context:window.audioContext?.state,sink:!!(window.audioContext?._sinkGain||window.vuAnalyser),ws:window.ws?.readyState,metadata:window.echoCatchRead().metadata})`);
    assert.equal(playback.context,'running');assert.ok(playback.sink);assert.equal(playback.ws,1);assert.ok(playback.metadata.frequency>0);
    const sizes=[];
    for(const [width,height] of [[1280,720],[1280,580],[1920,1080]]){
      w.setContentSize(width,height);await wait(1200);
      const layout=await remote(`({height:innerHeight,width:innerWidth,waterfall:document.querySelector('.spectrum-display-container').getBoundingClientRect().toJSON(),audio:document.querySelector('.audio-controls').getBoundingClientRect().toJSON(),frequency:document.getElementById('frequency').getBoundingClientRect().toJSON(),mode:document.getElementById('mode-usb').getBoundingClientRect().toJSON(),startHidden:document.getElementById('audio-start-overlay').classList.contains('hidden')})`);
      assert.ok(layout.startHidden);assert.ok(layout.audio.bottom<=layout.height+2,JSON.stringify(layout));assert.ok(layout.frequency.bottom<=layout.height);assert.ok(layout.mode.bottom<=layout.height);sizes.push(layout);
      if(width===1280&&height===580)fs.writeFileSync('dist/dahlonega-compact-final.png',(await target.contents.capturePage()).toPNG());
    }
    await remote(`document.getElementById('mode-usb').click()`);await wait(1500);
    assert.equal((await remote(`window.echoCatchRead().metadata`)).mode,'USB');
    const catchResult=await w.webContents.executeJavaScript(`echoCatch.start()`);await wait(12500);
    const list=await w.webContents.executeJavaScript(`echoCatch.list()`),saved=list.find(c=>c.id===catchResult.id);
    assert.equal(saved.metadata.capture_status,'complete');assert.equal(saved.metadata.audio_status,'saved');assert.ok(saved.metadata.audio_duration_seconds>=12);assert.equal(saved.metadata.receiver_id,'georgia');
    const wav=fs.readFileSync(path.join(tmp,'Echo Base','Radio Catches',saved.id,'audio.wav'));
    let peak=0;for(let i=44;i<wav.length;i+=2)peak=Math.max(peak,Math.abs(wav.readInt16LE(i)));assert.ok(peak>0);
    const report={success:true,tmp,start,playback,sizes,catch:saved.metadata,pcmPeak:peak};fs.writeFileSync('dist/dahlonega-verification.json',JSON.stringify(report,null,2));
    console.log('DAHLONEGA PASS',JSON.stringify({sizes:sizes.map(s=>[s.width,s.height,s.audio.bottom]),seconds:saved.metadata.audio_duration_seconds,peak}));w.close();app.quit();
  }catch(error){console.error(error);app.exit(1);}
});
