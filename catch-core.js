const fs = require('node:fs');
const path = require('node:path');

function wavHeader(samples, rate) {
  const b = Buffer.alloc(44); b.write('RIFF'); b.writeUInt32LE(36 + samples * 2, 4);
  b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples * 2, 40); return b;
}
function pcm(samples) {
  const b = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * (v < 0 ? 32768 : 32767)), i * 2)); return b;
}
class RollingAudio {
  constructor(seconds = 30) { this.seconds = seconds; this.reset(); }
  reset() { this.chunks = []; this.samples = 0; this.rate = 0; this.key = null; }
  push(samples, rate, key, now = Date.now()) {
    if (this.key !== key || this.rate !== rate) this.reset();
    this.key = key; this.rate = rate;
    this.chunks.push({ samples: Float32Array.from(samples), time: now }); this.samples += samples.length;
    while (this.chunks.length && (this.samples > rate * this.seconds || now - this.chunks[0].time > this.seconds * 1000)) {
      const first = this.chunks[0], excess = this.samples - rate * this.seconds;
      if (excess > 0 && excess < first.samples.length && now - first.time <= this.seconds * 1000) {
        first.samples = first.samples.slice(excess); this.samples -= excess; break;
      }
      this.samples -= this.chunks.shift().samples.length;
    }
  }
  snapshot(now = Date.now()) { return this.chunks.filter(c => now - c.time <= this.seconds * 1000).map(c => c.samples); }
}
function summary(m, note = '') {
  const show = v => v === null || v === undefined || v === '' ? 'Unavailable' : v;
  return `${m.frequency === null ? 'Frequency unavailable' : `${m.frequency} ${m.frequency_unit}`} ${show(m.mode)}\nReceiver: ${show(m.receiver)}\nLocal: ${m.timestamp_local}\nUTC: ${m.timestamp_utc}\nFilter: ${show(m.filter_width_hz)} Hz\nSignal: ${show(m.signal_dbm)} dBm\nSNR: ${show(m.snr_db)} dB\nLocation: ${show(m.receiver_location)}\nAudio: ${m.audio_status}; ${m.audio_duration_seconds.toFixed(2)} seconds (${m.pre_capture_seconds.toFixed(2)} before press)\nCapture: ${m.capture_status}\n${(m.warnings || []).join('\n')}\n\nNote:\n${note}\n`;
}
function crc32(b) { let c = 0xffffffff; for (const v of b) { c ^= v; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; }
// Standard ZIP, stored entries: no external compressor or shell needed.
function zip(entries) {
  const parts = [], central = []; let offset = 0, size = 0;
  for (const { name, data } of entries) {
    const n = Buffer.from(name), crc = crc32(data), h = Buffer.alloc(30), c = Buffer.alloc(46);
    h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26);
    c.writeUInt32LE(0x02014b50); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    parts.push(h, n, data); central.push(c, n); offset += h.length + n.length + data.length; size += c.length + n.length;
  }
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}
function atomic(file, data) {
  const temp = file + '.tmp'; fs.writeFileSync(temp, data);
  // Windows scanners/indexers can briefly lock the destination during replace.
  // Retry the atomic rename; never delete the existing file to force success.
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(temp, file); return; }
    catch (error) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 5) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(10 * 2 ** attempt, 80));
    }
  }
}
module.exports = { wavHeader, pcm, RollingAudio, summary, zip, atomic };
