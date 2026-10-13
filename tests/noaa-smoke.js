// Run with Electron, after closing Radio Hub, against its existing profile.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const restart=process.argv.includes('--restart');
process.argv.push('--noaa');
require('../main');
app.whenReady().then(async()=>{
  try {
    const w=BrowserWindow.getAllWindows()[0];
    const evaluate=code=>w.webContents.executeJavaScript(code,true);
    const snapshot=()=>evaluate(`({state:document.getElementById('state').value,station:document.getElementById('station').selectedOptions[0]?.textContent,call:localStorage.getItem('noaaCall'),frequency:document.getElementById('frequency').textContent,status:document.getElementById('status').textContent,coverage:document.getElementById('coverage').textContent,error:document.getElementById('error').textContent,errorVisible:!document.getElementById('error').hidden,playDisabled:document.getElementById('audio-toggle').disabled,src:document.getElementById('audio').getAttribute('src'),readyState:document.getElementById('audio').readyState,paused:document.getElementById('audio').paused,options:Array.from(document.getElementById('station').options,o=>({id:o.value,label:o.textContent}))})`);
    for(let i=0;i<100;i++){await wait(100);if(await evaluate(`!!document.getElementById('station')?.options.length`))break;}
    if(process.argv.includes('--prepare')) {
      await evaluate(`localStorage.setItem('noaaState','Georgia');localStorage.setItem('noaaCall','WXK53');`);
      w.webContents.reload(); await wait(1500);
    }
    const initial=await snapshot();
    assert.equal(initial.state,'Georgia');assert.equal(initial.call,'WXK53');assert.equal(initial.frequency,'162.550');
    assert.equal(initial.status,'Stream unavailable');assert.equal(initial.src,null);assert.ok(initial.playDisabled&&initial.errorVisible);
    assert.match(initial.coverage,/Pelham.*WXK53.*Dougherty/);
    const report={restart,initial,feeds:[]};
    if(!restart){
      await evaluate(`document.getElementById('station').value='KWN50-local';document.getElementById('station').dispatchEvent(new Event('change'));`);
      report.ashburn=await snapshot();assert.equal(report.ashburn.frequency,'162.450');assert.equal(report.ashburn.call,'KWN50');assert.equal(report.ashburn.status,'Stream unavailable');
      const feeds=initial.options.filter(o=>!o.id.endsWith('-local'));assert.equal(feeds.length,5);
      for(const feed of feeds){
        await evaluate(`document.getElementById('station').value=${JSON.stringify(feed.id)};document.getElementById('station').dispatchEvent(new Event('change'));`);
        for(let i=0;i<100;i++){await wait(200);const s=await snapshot();if(s.status==='Playing'||s.status==='Unavailable'){break;}}
        const s=await snapshot();report.feeds.push(s);console.log('FEED',s.station,s.status,s.readyState);
      }
      await evaluate(`document.getElementById('station').value='WXK53-local';document.getElementById('station').dispatchEvent(new Event('change'));`);
      report.final=await snapshot();assert.equal(report.final.call,'WXK53');assert.equal(report.final.src,null);
    }
    await wait(1500);
    fs.writeFileSync(path.join(__dirname,'../dist',restart?'noaa-restart.png':'noaa-local.png'),(await w.webContents.capturePage()).toPNG());
    await w.webContents.session.flushStorageData();
    fs.writeFileSync(path.join(__dirname,'../dist',restart?'noaa-restart-verification.json':'noaa-verification.json'),JSON.stringify(report,null,2));
    console.log('NOAA SMOKE PASS',JSON.stringify({restart,initial:initial.station,feeds:report.feeds.map(s=>[s.station,s.status])}));
    app.quit();
  }catch(e){console.error(e);app.exit(1);}
});
