// Worker klasik: ubah format audio apa pun (AMR, 3GP, WMA, OPUS, ...) jadi PCM 16 kHz mono lewat ffmpeg.wasm.
let core = null;
self.onmessage = async (e) => {
  const { data, ext, base } = e.data;
  try {
    if (!core) {
      importScripts(base + "/ffmpeg-core.js");
      const abs = (p) => new URL(base + "/" + p, self.location.href).href;
      const meta = btoa(JSON.stringify({ wasmURL: abs("ffmpeg-core.wasm"), workerURL: abs("ffmpeg-core.worker.js") }));
      core = await createFFmpegCore({ mainScriptUrlOrBlob: abs("ffmpeg-core.js") + "#" + meta });
    }
    const inp = "input." + (ext || "bin");
    core.FS.writeFile(inp, new Uint8Array(data));
    core.exec("-i", inp, "-vn", "-sn", "-ac", "1", "-ar", "16000", "-f", "s16le", "out.pcm");
    const code = core.ret;
    core.reset();
    if (code !== 0) throw new Error("ffmpeg exit " + code);
    const raw = core.FS.readFile("out.pcm");
    try { core.FS.unlink(inp); core.FS.unlink("out.pcm"); } catch (_) {}
    if (!raw.length) throw new Error("empty audio");
    const pcm = new Int16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength - (raw.byteLength % 2)));
    const f = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) f[i] = pcm[i] / 32768;
    self.postMessage({ ok: true, audio: f }, [f.buffer]);
  } catch (err) {
    core = null;
    self.postMessage({ ok: false, error: String(err && err.message ? err.message : err) });
  }
};
