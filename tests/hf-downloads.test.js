const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {install,isTwenteLogbook}=require('../hf-downloads');
test('only exact Twente logbook endpoint is targeted',()=>{
  assert.ok(isTwenteLogbook('http://websdr.ewi.utwente.nl:8901/~~logbook?nr=20'));
  assert.ok(isTwenteLogbook('http://websdr.ewi.utwente.nl:8901/~~logbook?nr=100'));
  for(const url of ['bad','http://example.com/~~logbook?nr=20','http://websdr.ewi.utwente.nl:8901/logbook.txt','http://websdr.ewi.utwente.nl:8901/recording.wav']) assert.equal(isTwenteLogbook(url),false);
});
test('repeated logbook downloads are prevented only for owned HF contents and listener is removed',()=>{
  const session=new EventEmitter(),hf={},other={};let cancelled=0;
  const remove=install(session,w=>w===hf),event={preventDefault(){cancelled++;}};
  const logbook={getURL:()=> 'http://websdr.ewi.utwente.nl:8901/~~logbook?nr=20'};
  session.emit('will-download',event,logbook,hf);session.emit('will-download',event,logbook,hf);
  assert.equal(cancelled,2);
  session.emit('will-download',event,logbook,other);
  session.emit('will-download',event,{getURL:()=> 'http://websdr.ewi.utwente.nl:8901/recording.wav'},hf);
  assert.equal(cancelled,2);remove();assert.equal(session.listenerCount('will-download'),0);
});
