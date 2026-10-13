const { WebContentsView, ipcMain } = require('electron');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const receivers = require('./receivers');
const hfURL = pathToFileURL(path.join(__dirname, 'hf.html')).href;
module.exports = function hfHost(window) {
  const api = {};
  let view, selected = 'twente', ready = false, failure = '', busy = false;
  const receiverContents = new Set();
  const removeDownloadGuard = require('./hf-downloads').install(window.webContents.session, contents => receiverContents.has(contents));
  let box = {x:0,y:0,width:0,height:0};
  const allowed = event => event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === hfURL;
  const twente = () => view && selected === 'twente' && view.webContents.getURL() === receivers[0].url;
  function close() { ready=false; if(view) { window.contentView.removeChildView(view); view.webContents.close(); view=undefined; } }
  function bounds(value) {
    if (!value || !['x','y','width','height'].every(key => Number.isFinite(value[key]))) return;
    box=value;
    const [width,height] = window.getContentSize();
    const zoom=window.webContents.getZoomFactor();
    const x=Math.max(0,Math.min(width,Math.round(value.x*zoom))), y=Math.max(0,Math.min(height,Math.round(value.y*zoom)));
    const pixels={x,y,width:Math.max(0,Math.min(width-x,Math.round(value.width*zoom))),height:Math.max(0,Math.min(height-y,Math.round(value.height*zoom)))};
    if(view) { view.setBounds(pixels); view.setVisible(pixels.width>0 && pixels.height>0); if(selected==='twente' && pixels.width)view.webContents.setZoomFactor(Math.min(1,pixels.width/1050)); }
  }
  async function select(id) {
    const receiver=receivers.find(item=>item.id===id); if(!receiver)throw new Error('Unknown receiver');
    api.onCatchSourceChanged?.();
    selected=id; close(); failure='';
    view=new WebContentsView({webPreferences:{offscreen:window.webContents.isOffscreen(),nodeIntegration:false,contextIsolation:true,sandbox:true}});
    const current=view; window.contentView.addChildView(current); bounds(box); current.setBackgroundColor('#000000');
    const contents = current.webContents;
    receiverContents.add(contents);
    contents.once('destroyed', () => receiverContents.delete(contents));
    current.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    current.webContents.on('did-start-navigation',(_event,_url,inPlace,main)=>{if(view===current && main && !inPlace)ready=false;});
    current.webContents.on('did-fail-load',(_event,code,message,_url,main)=>{if(view===current && main && code!==-3){failure=message;ready=false;}});
    current.webContents.on('dom-ready',async()=>{
      if(view===current){ready=true;failure='';}
      if(view!==current)return;
      if (selected === 'georgia' && new URL(current.webContents.getURL()).origin === new URL(receiver.url).origin) {
        try {
          await current.webContents.insertCSS(readFileSync(path.join(__dirname,'dahlonega.css'),'utf8'), { cssOrigin: 'user' });
          await current.webContents.executeJavaScript(readFileSync(path.join(__dirname,'dahlonega.js'),'utf8'));
        }
        catch(error) { console.error('Dahlonega appearance:',error.message); }
      }
      try {
        await current.webContents.executeJavaScript(readFileSync(path.join(__dirname,'catch-audio.js'),'utf8'));
        const catchAdapter = selected === 'georgia' ? 'catch-ubersdr.js' : 'catch-websdr.js';
        await current.webContents.executeJavaScript(readFileSync(path.join(__dirname,catchAdapter),'utf8'));
      } catch(error) { console.error('Catch adapter:',error.message); }
      if(!twente())return;
      try {
        await current.webContents.insertCSS(readFileSync(path.join(__dirname,'theme.css'),'utf8'));
        await current.webContents.executeJavaScript(readFileSync(path.join(__dirname,'cleanup.js'),'utf8'));
        await current.webContents.executeJavaScript(readFileSync(path.join(__dirname,'graphs.js'),'utf8'));
        await current.webContents.executeJavaScript(`document.getElementById('wf-size-100')?.click()`);
      }catch(error){console.error('HF appearance:',error.message);}
    });
    current.webContents.on('did-finish-load',()=>{if(view===current){ready=true;failure='';}});
    try { await current.webContents.loadURL(receiver.url); } catch(error) { if(view===current && error.code!=='ERR_ABORTED')failure=error.message; }
  }
  async function command(name,value) {
    if(!view)throw new Error('Receiver not connected');
    if(name==='reload'){api.onCatchSourceChanged?.();failure='';view.webContents.reloadIgnoringCache();return;}
    if(!ready || !twente())throw new Error('Use native controls for this receiver');
    let script;
    if(name==='frequency' && Number.isFinite(value) && value>=0 && value<=30000) script=`setfreqif(${value});`;
    if(name==='step' && [-5,-1,1,5].includes(value))script=`setfreqif(Math.max(0,Math.min(30000,Number(document.querySelector('input[name="frequency"]').value)+${value})));`;
    if(name==='volume' && Number.isFinite(value) && value>=-20 && value<=6)script=`(()=>{const input=document.getElementById('volumecontrol2');input.value=${value};input.dispatchEvent(new Event('input',{bubbles:true}));})()`;
    if(name==='mute' && typeof value==='boolean')script=`(()=>{const input=document.getElementById('mutecheckbox');if(input.checked!==${value})input.click();})()`;
    if(name==='mode' && ['CW','LSB','USB','AM','FM','AMsync'].includes(value))script=`(()=>{const b=[...document.querySelectorAll('input[type="button"],button')].find(b=>(b.value||b.textContent).trim()===${JSON.stringify(value)});if(!b)throw Error('Mode control unavailable');b.click();})()`;
    if(name==='filter' && ['narrower','wider'].includes(value))script=`(()=>{const b=[...document.querySelectorAll('input[type="button"],button')].find(b=>(b.value||b.textContent).trim()===${JSON.stringify(value)});if(!b)throw Error('Filter control unavailable');b.click();})()`;
    if(!script)throw new Error('Invalid receiver command');
    return view.webContents.executeJavaScript(script,true);
  }
  ipcMain.handle('hf:catalog',event=>{if(!allowed(event))throw Error('Invalid sender');return {receivers,selected};});
  ipcMain.handle('hf:select',(event,id)=>{if(!allowed(event))throw Error('Invalid sender');return select(id);});
  ipcMain.handle('hf:command',(event,name,value)=>{if(!allowed(event))throw Error('Invalid sender');return command(name,value);});
  const onBounds=(event,value)=>{if(allowed(event))bounds(value);}; ipcMain.on('hf:bounds',onBounds);
  const timer=setInterval(async()=>{
    if(busy || !view || window.isDestroyed() || window.webContents.getURL()!==hfURL)return;
    busy=true; const current=view; const receiver=receivers.find(item=>item.id===selected);
    let metrics={};
    try {
      if(ready && twente())metrics=await current.webContents.executeJavaScript(`(()=>{const text=document.getElementById('numericalsmeter')?.textContent.trim()||'';return {frequency:Number(document.querySelector('input[name="frequency"]')?.value),strength:text&&Number.isFinite(Number(text))?Number(text):null,mode:document.querySelector('button[id^="btn-"][style*="background"]')?.textContent.trim(),volume:Number(document.getElementById('volumecontrol2')?.value),muted:document.getElementById('mutecheckbox')?.checked,bandwidth:document.getElementById('numericalbandwidth6')?.textContent,adapter:typeof setfreqif==='function'};})()`);
      if(view===current && !window.isDestroyed())window.webContents.send('hf:status',{id:selected,label:receiver.label,host:new URL(receiver.url).host,ready,error:failure,...metrics,observedAt:new Date().toISOString()});
    }catch(_){}finally{busy=false;}
  },750);
  window.webContents.on('did-start-navigation',(_event,_url,inPlace,main)=>{if(main && !inPlace)close();});
  window.on('close',close);
  window.on('closed',()=>{clearInterval(timer);removeDownloadGuard();receiverContents.clear();for(const channel of ['hf:catalog','hf:select','hf:command'])ipcMain.removeHandler(channel);ipcMain.removeListener('hf:bounds',onBounds);});
  return Object.assign(api, { catchTarget(){const receiver=receivers.find(r=>r.id===selected);return view ? {contents:view.webContents,...receiver} : null;}, async open(id){selected=id;if(window.webContents.getURL()===hfURL)await select(id);else await window.loadFile(path.join(__dirname,'hf.html'));}, reload(){api.onCatchSourceChanged?.();if(view)view.webContents.reloadIgnoringCache();else window.webContents.reloadIgnoringCache();} });
};
