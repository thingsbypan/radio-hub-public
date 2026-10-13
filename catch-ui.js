(() => {
  if (!window.echoCatch) return;
  const host=document.querySelector('.module-header'), box=document.createElement('div');
  box.className='catch-controls';
  const button=document.createElement('button');button.className='catch-trigger';button.textContent='● LOG CATCH';button.type='button';
  const library=document.createElement('button');library.textContent='Catch Library';library.type='button';
  const status=document.createElement('span');status.setAttribute('role','status');status.className='catch-status';
  box.append(button,library,status);host?.append(box);
  let noteId, pending=false, statusUntil=0;
  const noteBox=document.createElement('form');noteBox.className='catch-note';noteBox.hidden=true;
  const label=document.createElement('label');label.textContent='Optional catch note';
  const input=document.createElement('input');input.maxLength=2000;input.placeholder='Strange repeating beeps…';label.append(input);
  const save=document.createElement('button');save.textContent='Save note';save.type='submit';
  const close=document.createElement('button');close.textContent='Close';close.type='button';close.onclick=()=>{noteBox.hidden=true;};
  noteBox.append(label,save,close);box.append(noteBox);
  noteBox.onsubmit=async e=>{e.preventDefault();statusUntil=Date.now()+15000;try{await echoCatch.note(noteId,input.value);status.textContent='Note saved';noteBox.hidden=true;}catch(err){status.textContent=err.message;}};
  button.onclick=async()=>{if(pending)return;pending=true;button.disabled=true;status.textContent='Saving catch…';try{const c=await echoCatch.start();noteId=c.id;input.value='';noteBox.hidden=false;status.textContent='Pre-capture saved · recording 12 seconds…';}catch(err){status.textContent=`Capture failed: ${err.message}`;button.disabled=false;pending=false;}};
  library.onclick=()=>echoCatch.library().catch(err=>{status.textContent=err.message;});
  echoCatch.onStatus(c=>{if(c.state==='error'){statusUntil=Date.now()+15000;status.textContent=c.message;button.disabled=false;pending=false;}if(c.state==='saved'){statusUntil=Date.now()+15000;button.disabled=false;pending=false;status.textContent=`CATCH SAVED · ${c.metadata.frequency ?? '—'} ${c.metadata.frequency_unit || ''} · ${new Date(c.metadata.timestamp_utc).toLocaleTimeString()}${c.metadata.audio_status==='unavailable'?' · audio unavailable':''}`;status.title=status.textContent;}});
  const bufferTimer=setInterval(()=>{if(!pending&&Date.now()>statusUntil)echoCatch.buffer().then(b=>{status.textContent=b.seconds>0?`Audio buffer: ${Math.min(30,b.seconds).toFixed(0)} / 30 seconds`:'Audio buffer unavailable / waiting for playback';}).catch(()=>{});},1000);
  const timer=setInterval(()=>{
    if(!window.echoCatchMetadata)return;
    const metadata=window.echoCatchMetadata(), packet=window.EchoCatchAudio?.drain();
    if(packet)echoCatch.audio({...packet,metadata});
  },250);
  window.addEventListener('beforeunload',()=>{clearInterval(timer);clearInterval(bufferTimer);window.EchoCatchAudio?.detach();},{once:true});
})();
