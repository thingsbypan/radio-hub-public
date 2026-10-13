const { app,BrowserWindow }=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'echo-catch-hf-'));app.setPath('documents',tmp);app.setPath('userData',path.join(tmp,'profile'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const quick=process.argv.includes('--quick');
const base=process.argv.includes('--packaged') ? path.join(__dirname,'../dist/win-unpacked/resources/app.asar') : path.join(__dirname,'..');
app.whenReady().then(async()=>{
  let w;
  try{
    w=new BrowserWindow({show:true,x:40,y:40,width:1280,height:900,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,preload:path.join(base,'preload.js')}});
    const hf=require(path.join(base,'hf-host.js'))(w),catches=require(path.join(base,'catch-host.js'))(w,hf);hf.onCatchSourceChanged=()=>catches.sourceChanged();
    await w.loadFile(path.join(base,'hf.html'));await wait(12000);
    const target=hf.catchTarget();assert.ok(target);
    const begin=await target.contents.executeJavaScript(`(()=>{soundapplet?.audioresume?.();return {url:location.href,audio:!!window.soundapplet?.p,mode:window.mode,rate:window.soundapplet?.p?.context?.sampleRate};})()`,true);console.log('Connected',JSON.stringify(begin));
    await wait(quick?2000:32000);
    console.log('Buffer',JSON.stringify(await target.contents.executeJavaScript(`(()=>{const p=soundapplet?.p;return {context:p?.context?.state,adapter:!!window.echoCatchRead,metadata:window.echoCatchRead?.().metadata};})()`)));
    w.show();w.focus();await wait(1000);
    console.log('Visibility',JSON.stringify({visible:w.isVisible(),minimized:w.isMinimized(),bounds:w.getBounds(),views:w.contentView.children.map(v=>v.getBounds())}));
    const c=await w.webContents.executeJavaScript(`echoCatch.start()`);await wait(13000);
    const list=await w.webContents.executeJavaScript('echoCatch.list()'),saved=list.find(x=>x.id===c.id);console.log(JSON.stringify({tmp,saved},null,2));
    assert.ok(saved.metadata.pre_capture_seconds>(quick?1:27));assert.ok(saved.metadata.audio_duration_seconds>(quick?10:38));assert.equal(saved.metadata.screenshot_status,'saved');assert.ok(saved.metadata.mode);assert.ok(saved.metadata.frequency>0);
    const dir=path.join(tmp,'Echo Base','Radio Catches',c.id);fs.copyFileSync(path.join(dir,'waterfall.png'),path.join(tmp,'hf.png'));
    fs.writeFileSync(path.join(tmp,'shell.png'),(await w.webContents.capturePage()).toPNG());
    const originalCapture=target.contents.capturePage.bind(target.contents);target.contents.capturePage=()=>Promise.reject(Error('Forced native screenshot failure (test)'));
    const changed=await w.webContents.executeJavaScript('echoCatch.start()');await wait(500);target.contents.capturePage=originalCapture;
    await w.webContents.executeJavaScript(`echoHF.command('frequency',${saved.metadata.frequency+1})`);await wait(1200);
    const changedCatch=(await w.webContents.executeJavaScript('echoCatch.list()')).find(x=>x.id===changed.id);
    assert.equal(changedCatch.metadata.capture_status,'partial');assert.match(changedCatch.metadata.warnings.join(' '),/tuning/);
    assert.equal(changedCatch.metadata.screenshot_method,'receiver-canvases');assert.equal(changedCatch.metadata.screenshot_status,'saved');
    fs.copyFileSync(path.join(tmp,'Echo Base','Radio Catches',changed.id,'waterfall.png'),path.join(tmp,'fallback.png'));
    assert.equal(await target.contents.executeJavaScript('soundapplet.p.context.state'),'running');
    console.log('HF CAPTURE PASS');w.close();app.quit();
  }catch(e){console.error(e);if(w&&!w.isDestroyed())w.close();app.exit(1);}
});
