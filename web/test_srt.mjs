import { fmtTime, chunksToCues, cuesToSrt, wrapTwoLines } from "./srt.js";
import assert from "node:assert";
assert.equal(fmtTime(0), "00:00:00,000");
assert.equal(fmtTime(3661.5), "01:01:01,500");
assert.equal(fmtTime(59.9996), "00:01:00,000");
const chunks = [
  { text: " Halo semuanya. Selamat datang di channel kami, hari ini kita bahas cara membuat subtitle otomatis.", timestamp: [0, 9] },
  { text: " Terima kasih sudah menonton.", timestamp: [9.5, null] },
  { text: "  ", timestamp: [12, 13] },
];
const cues = chunksToCues(chunks, 14, 42);
console.log(cuesToSrt(cues));
assert(cues.length >= 3);
assert(cues.every((c, i) => c.e > c.s && (i === 0 || cues[i - 1].e <= c.s)));
assert(cues.every((c) => c.t.split("\n").length <= 2));
assert(wrapTwoLines("ini adalah kalimat yang cukup panjang sekali untuk dipecah", 30).includes("\n"));
console.log("OK");
