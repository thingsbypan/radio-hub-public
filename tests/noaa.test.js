const { test } = require('node:test');
const assert = require('node:assert/strict');
const local = require('../noaa-local');
const directory = require('../noaa-stations.json').stations;
test('Dougherty metadata supplements all original provider entries without guessed streams', () => {
  const merged = local.merge(directory);
  for (const station of directory) assert.ok(merged.includes(station));
  assert.equal(merged.filter(s => s.state === 'Georgia').length, directory.filter(s => s.state === 'Georgia').length + 2);
  assert.deepEqual(local.stations.map(s => [s.call, s.frequency, s.powerWatts, s.url]), [['WXK53', '162.550', 500, null], ['KWN50', '162.450', 300, null]]);
});
test('public first run and saved station preferences', () => {
  const settings = new Map();
  const read = k => settings.get(k) ?? null, save = (k,v) => settings.set(k,v);
  assert.deepEqual(local.startup(read,save), {state:'Alabama',call:''});
  assert.equal(settings.size,0);
  save('noaaState','Florida');save('noaaCall','WNG522');save('noaaWeatherZip','12345');
  assert.deepEqual(local.startup(read,save), {state:'Florida',call:'WNG522'});
  assert.equal(read('noaaWeatherZip'),'12345');
});
test('a future provider-listed local stream retains its real URL', () => {
  const feed={...local.stations[0],id:'provider-local',url:'https://example.test/real-fixture',provider:'Test fixture'};
  const merged=local.merge([feed]);
  assert.equal(merged.length,2); assert.equal(merged[0].url,feed.url);
});
