(() => {
  const api=window.echoCatch,list=document.getElementById('list'),status=document.getElementById('status');let blobs=[];
  const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
  const action=(parent,label,fn)=>{const b=el('button',label);b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};parent.append(b);return b;};
  async function refresh(){
    const catches=await api.list();for(const url of blobs)URL.revokeObjectURL(url);blobs=[];list.replaceChildren();
    status.textContent=catches.length?`${catches.length} catches`:'No catches yet. Press LOG CATCH while listening.';
    for(const c of catches){const m=c.metadata,row=el('article');
      row.append(el('h2',`${m.frequency ?? 'Frequency unavailable'} ${m.frequency_unit || ''} ${m.mode || ''} · ${m.receiver || 'Source unavailable'}`),el('p',`${new Date(m.timestamp_utc).toLocaleString()} · UTC ${m.timestamp_utc}\n${m.audio_duration_seconds.toFixed(1)} seconds · ${c.active?'Recording…':m.capture_status}${m.audio_status==='unavailable'?' · Audio unavailable':''}`),el('p',c.note || 'No note'));
      if(m.warnings.length)row.append(el('p',m.warnings.join('\n')));
      const controls=el('div');controls.className='actions';
      const play=action(controls,'Play audio',async()=>{const bytes=await api.audioFile(c.id),url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));blobs.push(url);const audio=el('audio');audio.controls=true;audio.src=url;controls.append(audio);await audio.play();play.hidden=true;});play.disabled=c.active||!m.audio_duration_seconds;
      const image=action(controls,'Open screenshot',async()=>{const err=await api.screenshot(c.id);if(err)throw Error(err);});image.disabled=m.screenshot_status!=='saved';
      action(controls,'Open folder',()=>api.reveal(c.id));
      const exportButton=action(controls,'EXPORT FOR RADIOBOT',async()=>{const file=await api.export(c.id);status.textContent=`ZIP ready: ${file}`;});exportButton.disabled=c.active||m.screenshot_status==='pending';
      const remove=action(controls,'Delete',async()=>{if(await api.remove(c.id))await refresh();});remove.disabled=c.active;
      const note=el('textarea');note.maxLength=2000;note.value=c.note;note.setAttribute('aria-label','Catch note');
      row.append(controls,note);action(row,'Save note',async()=>{await api.note(c.id,note.value);status.textContent='Note saved';});list.append(row);
    }
  }
  document.getElementById('refresh').onclick=()=>refresh().catch(e=>{status.textContent=e.message;});
  document.getElementById('folder').onclick=()=>api.reveal();api.onStatus(()=>refresh().catch(e=>{status.textContent=e.message;}));
  refresh().catch(e=>{status.textContent=e.message;});
})();
