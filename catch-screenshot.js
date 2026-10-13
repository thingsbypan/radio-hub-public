// Read-only fallback for WebContentsView surfaces unavailable to Chromium capturePage.
// Copy real canvas pixels, visible scale/marker images, and measured capture context.
(() => {
  const width=Math.round(innerWidth),height=Math.round(innerHeight);
  const output=document.createElement('canvas');output.width=width;output.height=height;
  const paint=output.getContext('2d');paint.fillStyle='#080808';paint.fillRect(0,0,width,height);
  let count=0;
  for(const canvas of document.querySelectorAll('canvas')){
    const r=canvas.getBoundingClientRect();
    if(r.width<16||r.height<16||r.bottom<0||r.top>height||getComputedStyle(canvas).visibility==='hidden')continue;
    try{paint.drawImage(canvas,r.x,r.y,r.width,r.height);count++;}catch(_){}
  }
  if(!count)throw Error('No readable receiver canvases available');
  for(const img of document.querySelectorAll('img')){
    const r=img.getBoundingClientRect();
    if(!img.complete||!img.naturalWidth||!r.width||!r.height||r.bottom<0||r.top>height)continue;
    // Only same-origin images: a cross-origin image would taint the complete PNG.
    try{if(new URL(img.currentSrc||img.src,location.href).origin===location.origin)paint.drawImage(img,r.x,r.y,r.width,r.height);}catch(_){}
  }
  const m=window.echoCatchScreenshotMetadata || {};
  const lines=[
    'RADIO HUB · Receiver canvas snapshot',
    `${m.frequency ?? 'Frequency unavailable'} ${m.frequency_unit||''}  ${m.mode||'Mode unavailable'}  ·  ${m.receiver||'Receiver unavailable'}`,
    `Filter: ${m.filter_width_hz===null?'unavailable':m.filter_width_hz+' Hz'}  ·  Signal: ${m.signal_dbm===null?'unavailable':m.signal_dbm+' dBm'}`,
    `Catch UTC: ${m.timestamp_utc} · Native interface screenshot unavailable`,
  ];
  paint.fillStyle='#151515';paint.fillRect(0,height-100,width,100);paint.fillStyle='#edc582';paint.font='14px sans-serif';
  lines.forEach((line,i)=>paint.fillText(line,12,height-78+i*21,width-24));
  return {data:output.toDataURL('image/png').split(',')[1],captured_at:new Date().toISOString()};
})();
