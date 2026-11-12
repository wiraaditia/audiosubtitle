// Pembaca WAV murni (PCM 8/16/24/32-bit, float 32/64, WAVE_FORMAT_EXTENSIBLE) -> mono Float32.
export function parseWav(ab) {
  const v = new DataView(ab);
  const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (ab.byteLength < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let fmt = null, dataOff = -1, dataLen = 0, o = 12;
  while (o + 8 <= ab.byteLength) {
    const id = tag(o), size = v.getUint32(o + 4, true);
    if (id === "fmt ") {
      let format = v.getUint16(o + 8, true);
      if (format === 0xfffe && size >= 26) format = v.getUint16(o + 8 + 24, true);
      fmt = { format, ch: v.getUint16(o + 10, true), sr: v.getUint32(o + 12, true), bits: v.getUint16(o + 22, true) };
    } else if (id === "data") {
      dataOff = o + 8;
      dataLen = Math.min(size === 0 || size === 0xffffffff ? ab.byteLength : size, ab.byteLength - dataOff);
      break;
    }
    o += 8 + size + (size & 1);
  }
  if (!fmt || dataOff < 0 || !fmt.ch) return null;
  const { format, ch, sr, bits } = fmt;
  const bps = bits >> 3;
  if (!((format === 1 && [1, 2, 3, 4].includes(bps)) || (format === 3 && (bps === 4 || bps === 8)))) return null;
  const frames = Math.floor(dataLen / (bps * ch));
  const out = new Float32Array(frames);
  let p = dataOff;
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < ch; c++, p += bps) {
      let x;
      if (format === 3) x = bps === 4 ? v.getFloat32(p, true) : v.getFloat64(p, true);
      else if (bps === 1) x = (v.getUint8(p) - 128) / 128;
      else if (bps === 2) x = v.getInt16(p, true) / 32768;
      else if (bps === 3) { let n = v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getUint8(p + 2) << 16); if (n & 0x800000) n -= 0x1000000; x = n / 8388608; }
      else x = v.getInt32(p, true) / 2147483648;
      sum += x;
    }
    out[i] = sum / ch;
  }
  return { sampleRate: sr, samples: out };
}
