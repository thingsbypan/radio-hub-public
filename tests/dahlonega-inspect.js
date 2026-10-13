const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'dahlonega-inspect-')));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
  try{
    const w=new BrowserWindow({show:false,width:1280,height:580,webPreferences:{sandbox:true}});
    await w.loadURL('https://websdr.lumpkinschools.com/');
    await w.webContents.insertCSS(fs.readFileSync(path.join(__dirname,'../dahlonega.css'),'utf8'),{cssOrigin:'user'});
    await w.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'../dahlonega.js'),'utf8'));
    for(let i=0;i<200;i++){await wait(100);if(await w.webContents.executeJavaScript(`!document.getElementById('audio-start-button').disabled`))break;}
    await wait(1000);fs.writeFileSync('dist/dahlonega-start.png',(await w.webContents.capturePage()).toPNG());
    console.log('Before start',await w.webContents.executeJavaScript(`({resize:window.spectrumDisplay?.resizeCanvas.toString(),height:window.spectrumDisplay?.setWaterfallHeight.toString()})`));
    await w.webContents.executeJavaScript(`document.getElementById('audio-start-button').click()`,true);await wait(8000);
    console.log('After start',await w.webContents.executeJavaScript(`({overlay:document.getElementById('audio-start-overlay').className,toast:document.getElementById('notification-toast').textContent,spectrum:!!window.spectrumDisplay})`));
    console.log('Audio globals',await w.webContents.executeJavaScript(`Object.keys(window).filter(k=>/audio|client|radio/i.test(k)).map(k=>{try{return [k,typeof window[k],typeof window[k]==='object'&&window[k] ? Object.keys(window[k]).slice(0,90) : null]}catch(e){return [k,'error']}})`));
    const dump=await w.webContents.executeJavaScript(`({elements:Array.from(document.querySelectorAll('.container > *, .controls > *, .spectrum-display-panel > *')).map(e=>({tag:e.tagName,id:e.id,cls:e.className,rect:e.getBoundingClientRect().toJSON(),style:getComputedStyle(e).cssText})),buttons:Array.from(document.querySelectorAll('.controls button,.audio-controls button')).map(e=>({id:e.id,text:e.textContent.trim().slice(0,40)}))})`);
    fs.writeFileSync('dist/dahlonega-dom.json',JSON.stringify(dump,null,2));
    fs.writeFileSync('dist/dahlonega-before.png',(await w.webContents.capturePage()).toPNG());w.close();app.quit();
  }catch(e){console.error(e);app.exit(1);}
});
