import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from wav2srt import fmt_time, words_to_cues, cues_to_srt, wrap_two_lines

assert fmt_time(0) == "00:00:00,000"
assert fmt_time(3661.5) == "01:01:01,500"
assert fmt_time(59.9996) == "00:01:00,000"

words = [(0.0, 0.4, " Halo"), (0.4, 0.9, " semuanya."), (1.0, 1.5, " Selamat"),
         (1.5, 2.0, " datang"), (2.0, 2.6, " di"), (2.6, 3.2, " channel"),
         (10.0, 10.5, " Baru"), (10.5, 11.0, " lagi")]
cues = words_to_cues(words, max_chars=42)
print(cues_to_srt(cues))
assert cues[0][0] == 0.0 and cues[-1][0] == 10.0   # jeda panjang memecah cue
assert all(cues[i][1] <= cues[i + 1][0] for i in range(len(cues) - 1))
assert "\n" in wrap_two_lines("ini adalah kalimat yang cukup panjang sekali untuk dipecah", 30)
print("OK")
