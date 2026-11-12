// Fungsi murni pembuat SRT (bisa dites di Node).
export function fmtTime(t) {
  let ms = Math.round(Math.max(t, 0) * 1000);
  const h = Math.floor(ms / 3600000); ms -= h * 3600000;
  const m = Math.floor(ms / 60000); ms -= m * 60000;
  const s = Math.floor(ms / 1000); ms -= s * 1000;
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
}

export function wrapTwoLines(text, max) {
  text = text.trim();
  if (text.length <= max) return text;
  const w = text.split(/\s+/);
  let best = text, bestDiff = Infinity;
  for (let i = 1; i < w.length; i++) {
    const a = w.slice(0, i).join(" "), b = w.slice(i).join(" ");
    const d = Math.abs(a.length - b.length);
    if (d < bestDiff) { bestDiff = d; best = a + "\n" + b; }
  }
  return best;
}

// Pecah satu chunk Whisper {text, timestamp:[s,e]} jadi beberapa cue (waktu proporsional per karakter).
function chunkToCues(text, s, e, maxChars, maxDur = 6) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const total = words.reduce((a, w) => a + w.length + 1, 0);
  const limit = maxChars * 2;
  const timeAt = (p) => s + ((e - s) * p) / total;
  const cues = [];
  let cur = [], curLen = 0, pos = 0, startPos = 0;
  const flush = (endPos) => {
    if (!cur.length) return;
    cues.push({ s: timeAt(startPos), e: timeAt(endPos), t: wrapTwoLines(cur.join(" "), maxChars) });
    cur = []; curLen = 0; startPos = endPos;
  };
  for (const w of words) {
    const add = w.length + 1;
    if (cur.length && (curLen + add > limit || timeAt(pos + add) - timeAt(startPos) > maxDur)) flush(pos);
    cur.push(w); curLen += add; pos += add;
    if (/[.?!。]$/.test(w) && cur.length > 2) flush(pos);
  }
  flush(pos);
  return cues;
}

export function chunksToCues(chunks, duration, maxChars = 42) {
  let cues = [];
  for (const c of chunks) {
    const text = (c.text || "").trim();
    if (!text) continue;
    let [s, e] = c.timestamp || [0, null];
    s = s ?? 0;
    if (e == null || e <= s) e = Math.min(duration || s + 3, s + 3);
    cues = cues.concat(chunkToCues(text, s, e, maxChars));
  }
  cues.sort((a, b) => a.s - b.s);
  for (let i = 0; i < cues.length - 1; i++) if (cues[i].e > cues[i + 1].s) cues[i].e = cues[i + 1].s;
  return cues.filter((c) => c.e > c.s);
}

export function cuesToSrt(cues) {
  return cues.map((c, i) => `${i + 1}\n${fmtTime(c.s)} --> ${fmtTime(c.e)}\n${c.t}\n`).join("\n");
}
