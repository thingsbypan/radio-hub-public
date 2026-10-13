const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'radio-hf-download-'));
app.setPath('userData',path.join(tmp,'profile'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
  try{
    // Force the reported response into the download path without relying on
    // the remote server to reproduce its intermittent response headers.
    const fixture=session.fromPartition('hf-download-fixture');
    fixture.protocol.handle('http',()=>new Response('logbook fixture',{headers:{'content-type':'application/octet-stream','content-disposition':'attachment; filename="logbook"'}}));
    const w=new BrowserWindow({show:false,webPreferences:{session:fixture,sandbox:true}});
    const remove=require('../hf-downloads').install(fixture,c=>c===w.webContents);
    let cancelled=0,allowed=0;
    fixture.on('will-download',(event,item)=>{
      if(event.defaultPrevented)cancelled++;
      else{allowed++;item.setSavePath(path.join(tmp,'recording.wav'));}
    });
    await w.loadURL('about:blank');
    for(let i=0;i<2;i++)w.webContents.downloadURL('http://websdr.ewi.utwente.nl:8901/~~logbook?nr=20');
    w.webContents.downloadURL('http://websdr.ewi.utwente.nl:8901/recording.wav');
    for(let i=0;i<60&&(cancelled!==2||!fs.existsSync(path.join(tmp,'recording.wav')));i++)await wait(100);
    assert.equal(cancelled,2);assert.equal(allowed,1);assert.ok(fs.existsSync(path.join(tmp,'recording.wav')));remove();w.close();
    const live=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{sandbox:true,contextIsolation:true,preload:path.join(__dirname,'../preload.js')}});
    const host=require('../hf-host')(live);const observed=[];
    live.webContents.session.on('will-download',(event,item)=>{
      observed.push({url:item.getURL(),cancelled:event.defaultPrevented});
      if(!event.defaultPrevented){event.preventDefault();throw Error('Unexpected live download');}
    });
    const passes=[];
    for(let pass=0;pass<3;pass++){
      await live.loadFile(path.join(__dirname,'../hf.html'));
      let target;
      for(let i=0;i<150;i++){
        await wait(100);target=host.catchTarget();
        if(target && await target.contents.executeJavaScript(`document.readyState==='complete'&&typeof setfreqif==='function'`).catch(()=>false))break;
      }
      assert.ok(target);await wait(1000);
      const result=await target.contents.executeJavaScript(`({waterfall:!!document.getElementById('waterfalls'),frequency:document.querySelector('input[name="frequency"]')?.value,adapter:typeof setfreqif==='function'})`);
      assert.ok(result.waterfall&&result.adapter);passes.push(result);
      await live.loadFile(path.join(__dirname,'../radio.html'));await wait(200);assert.equal(host.catchTarget(),null);
    }
    live.close();
    const report={success:true,fixture:{cancelled,allowed},passes,observed,tmp};
    fs.writeFileSync(path.join(__dirname,'../dist/hf-downloads-verification.json'),JSON.stringify(report,null,2));
    console.log('HF DOWNLOAD SMOKE PASS',JSON.stringify(report));app.quit();
  }catch(error){console.error(error);app.exit(1);}
});
