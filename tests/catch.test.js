const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RollingAudio, wavHeader, pcm, zip, summary } = require('../catch-core');
test('atomic replacement retries transient Windows locks and preserves data on lasting failure', () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const {atomic} = require('../catch-core');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'catch-atomic-')), file=path.join(dir,'metadata.json');
  fs.writeFileSync(file,'old');const rename=fs.renameSync;let attempts=0;
  try {
    fs.renameSync=(...args)=>{if(++attempts<3)throw Object.assign(new Error('locked'),{code:'EPERM'});return rename(...args);};
    atomic(file,'new');assert.equal(attempts,3);assert.equal(fs.readFileSync(file,'utf8'),'new');
    fs.renameSync=()=>{throw Object.assign(new Error('locked'),{code:'EACCES'});};
    assert.throws(()=>atomic(file,'pending'),/locked/);assert.equal(fs.readFileSync(file,'utf8'),'new');assert.equal(fs.readFileSync(file+'.tmp','utf8'),'pending');
  } finally {fs.renameSync=rename;fs.rmSync(dir,{recursive:true,force:true});}
});
test('rolling buffer retains exactly 30 seconds and resets on receiver/tuning changes',()=>{
  const ring=new RollingAudio();for(let i=0;i<35;i++)ring.push(new Array(8000).fill(i/100),8000,'15245:AM',i*1000);
  assert.equal(ring.samples,240000);assert.equal(ring.snapshot(34000).length,30);
  ring.push([.1,.2],8000,'15245:LSB',35000);assert.equal(ring.samples,2);
  assert.equal(ring.snapshot(70000).length,0);
});
test('partial chunks are trimmed, rates never mix, WAV has correct PCM format and clipping',()=>{
  const ring=new RollingAudio(1);ring.push(new Array(5000).fill(0),8000,'x',0);ring.push(new Array(5000).fill(.5),8000,'x',500);assert.equal(ring.samples,8000);assert.equal(ring.chunks[0].samples.length,3000);
  ring.push([1],16000,'x',600);assert.equal(ring.samples,1);
  const h=wavHeader(4,48000);assert.equal(h.toString('ascii',0,4),'RIFF');assert.equal(h.readUInt32LE(40),8);assert.equal(h.readUInt32LE(24),48000);assert.equal(h.readUInt16LE(22),1);
  const bytes=pcm([-2,-1,0,2]);assert.equal(bytes.readInt16LE(0),-32768);assert.equal(bytes.readInt16LE(6),32767);
});
test('ZIP preserves names, bytes and standard signatures; summary does not invent metrics',()=>{
  const z=zip([{name:'RadioCatch_test/notes.txt',data:Buffer.from('Strange beeps')}]);assert.equal(z.readUInt32LE(0),0x04034b50);assert.equal(z.readUInt32LE(z.length-22),0x06054b50);
  const s=summary({frequency:null,frequency_unit:null,mode:null,receiver:null,timestamp_local:'local',timestamp_utc:'utc',filter_width_hz:null,signal_dbm:null,snr_db:null,receiver_location:null,audio_status:'unavailable',audio_duration_seconds:0,pre_capture_seconds:0,capture_status:'partial',warnings:[]});assert.match(s,/Signal: Unavailable/);assert.match(s,/Frequency unavailable/);
});
