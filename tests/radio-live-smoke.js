const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'radio-live-'));app.setPath('userData',temp);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 const w=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true}});w.webContents.setAudioMuted(true);
 const evaluate=s=>w.webContents.executeJavaScript(s,true);const report={directory:false,playback:false,attempts:[]};
 try{
  await w.loadFile(path.join(__dirname,'../radio.html'));
  for(let i=0;i<100;i++){await wait(300);if(await evaluate(`document.querySelectorAll('.station-row').length>0`)){report.directory=true;break;}}
  report.directoryStatus=await evaluate(`document.getElementById('results-status').textContent`);
  if(report.directory){
   for(let n=0;n<3&&!report.playback;n++){
    await evaluate(`document.querySelectorAll('.station-row')[${n}]?.querySelector('button').click()`);
    for(let i=0;i<40;i++){await wait(250);if(await evaluate(`document.getElementById('audio').currentTime>.5`)){report.playback=true;break;}}
    report.attempts.push(await evaluate(`({name:document.getElementById('now-name').textContent,status:document.getElementById('playback-status').textContent,error:document.getElementById('playback-error').textContent,time:document.getElementById('audio').currentTime})`));
   }
  }
 }catch(error){report.error=error.message;}
 fs.writeFileSync(path.join(__dirname,'../release-checks/radio-live.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));w.close();app.quit();
});
