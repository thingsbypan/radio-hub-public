// Exercise the actual app entry point with isolated storage; never touch the user's profile.
const {app,BrowserWindow,Menu}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=process.env.RADIO_HUB_TEST_ROOT||path.join(__dirname,'..');
const out=path.join(__dirname,'../release-checks');fs.mkdirSync(out,{recursive:true});
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'radio-release-'));
app.setPath('appData',temporary);app.setPath('documents',temporary);
process.argv.push('--radio');
const errors=[],checks=[];
app.on('web-contents-created',(_event,contents)=>{
  contents.setAudioMuted(true);
  contents.on('console-message',(_event,details)=>{if(details.level==='error'&&/ReferenceError|TypeError|SyntaxError/.test(details.message))errors.push(details.message);});
});
require(path.join(root,'main.js'));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
 try{
  const w=BrowserWindow.getAllWindows()[0];const evaluate=s=>w.webContents.executeJavaScript(s,true);
  await wait(1500);
  assert.equal(w.isFullScreen(),false);checks.push('Normal resizable window, not fullscreen');
  assert.equal(w.isResizable(),true);
  assert.equal(Menu.getApplicationMenu().getMenuItemById('receiver-space'),null);
  assert.equal(Menu.getApplicationMenu().getMenuItemById('receiver-ambience'),null);
  checks.push('Removed modules absent from native menu');
  // Deterministic offline case, including remote HF receiver failure.
  w.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true}));
  for(const id of ['hf','noaa','radio']){
   await w.loadFile(path.join(root,id+'.html'));await wait(1200);
   assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('nav.echo-tabs a'),a=>a.getAttribute('href'))`),['hf.html','noaa.html','radio.html']);
   assert.equal(await evaluate(`typeof echoSatellite`),'undefined');
   assert.equal(await evaluate(`document.querySelectorAll('nav.echo-tabs a[aria-current]').length`),1);
   checks.push(id+': three tabs, active selection, no satellite bridge');
   if(id==='noaa')assert.ok(await evaluate(`document.getElementById('station').options.length>0`));
   for(const [width,height] of [[1236,574],[640,700],[400,700]]){
    w.setContentSize(width,height);await wait(350);
    assert.ok(await evaluate(`document.documentElement.scrollWidth <= innerWidth+1`),id+' horizontal overflow at '+width);
    assert.ok(await evaluate(`Array.from(document.querySelectorAll('nav.echo-tabs a')).every(a=>a.getBoundingClientRect().right<=innerWidth+1)`));
    assert.ok(await evaluate(`(()=>{const h=document.querySelector('.module-header'), c=document.querySelector('.catch-controls');return !h||!c||c.getBoundingClientRect().bottom<=h.getBoundingClientRect().bottom+1})()`),id+' catch controls exceed header at '+width);
    try { fs.writeFileSync(path.join(out,`${process.env.RADIO_HUB_TEST_ROOT?'packaged':'source'}-${id}-${width}.png`),(await w.webContents.capturePage()).toPNG()); } catch (error) { if (!String(error).includes('UnknownVizError')) throw error; checks.push(id+': screenshot unavailable on this Windows graphics session'); }
   }
   checks.push(id+': desktop and 640/400px layouts fit');
  }
  await w.loadFile(path.join(root,'hf.html'));await wait(500);
  await w.loadFile(path.join(root,'radio.html'));await wait(500);
  assert.equal(w.contentView.children.length,0);checks.push('Leaving HF disposes remote receiver view');
  assert.deepEqual(errors,[]);checks.push('No JavaScript runtime exceptions');
  fs.writeFileSync(path.join(out,`${process.env.RADIO_HUB_TEST_ROOT?'packaged':'source'}-verification.json`),JSON.stringify({success:true,checks,errors,temporary,network:'Blocked deliberately to verify offline failure handling'},null,2));
  console.log(JSON.stringify({success:true,checks}));w.close();app.quit();
 }catch(error){console.error(error);fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:error.stack,checks,errors},null,2));app.exit(1);}
});

