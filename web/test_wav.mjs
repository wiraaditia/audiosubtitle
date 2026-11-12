import { parseWav } from "./wav.js";
import assert from "node:assert";
function mk({ bits, ch, sr, float = false, ext = false, n = 100 }) {
  const bps = bits / 8, dl = n * ch * bps, fl = ext ? 40 : 16;
  const b = new ArrayBuffer(12 + 8 + fl + 8 + dl), v = new DataView(b);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, b.byteLength - 8, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, fl, true);
  v.setUint16(20, ext ? 0xfffe : float ? 3 : 1, true); v.setUint16(22, ch, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * ch * bps, true); v.setUint16(32, ch * bps, true); v.setUint16(34, bits, true);
  if (ext) { v.setUint16(36, 22, true); v.setUint16(38, bits, true); v.setUint16(44, float ? 3 : 1, true); }
  const d = 20 + fl; w(d, "data"); v.setUint32(d + 4, dl, true);
  for (let i = 0; i < n * ch; i++) {
    const o = d + 8 + i * bps, a = 0.5;
    if (float) bits === 32 ? v.setFloat32(o, a, true) : v.setFloat64(o, a, true);
    else if (bits === 16) v.setInt16(o, a * 32767, true);
    else if (bits === 32) v.setInt32(o, a * 2147483647, true);
    else if (bits === 24) { const x = Math.round(a * 8388607); v.setUint8(o, x & 255); v.setUint8(o + 1, (x >> 8) & 255); v.setUint8(o + 2, (x >> 16) & 255); }
    else v.setUint8(o, 128 + a * 127);
  }
  return b;
}
for (const c of [{bits:16,ch:2,sr:44100},{bits:24,ch:1,sr:48000},{bits:32,ch:2,sr:44100},{bits:32,ch:1,sr:22050,float:true},{bits:16,ch:1,sr:16000,ext:true},{bits:8,ch:1,sr:8000}]) {
  const r = parseWav(mk(c));
  assert(r && r.samples.length === 100 && r.sampleRate === c.sr, JSON.stringify(c));
  assert(Math.abs(r.samples[50] - 0.5) < 0.02, JSON.stringify(c) + " val " + r.samples[50]);
}
assert.equal(parseWav(new ArrayBuffer(10)), null);
console.log("wav OK");
