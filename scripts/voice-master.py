#!/usr/bin/env python3
"""
Мастеринг озвучки по VOICE_BIBLE.md §6.2–6.5: fx-цепочка, обрезка тишины, голова/хвост,
двухпроходный loudnorm (линейно) или усиление + лимитер, когда пик не даёт поднять линейно.
Выход: public/voice/<id>.mp3 — 48 кГц, моно, CBR 96 кбит/с.

  python3 scripts/voice-master.py --raw voice-raw [--raw voice-raw-old ...] [--ids c03.outro.001,...]

Сырьё ищется в каталогах --raw по порядку (<id>.mp3 или <id>.wav). План — docs/production/voice-master.tsv
(npm run manifest). Нужен ffmpeg с libmp3lame и libopus.
"""
import argparse, json, os, subprocess, tempfile
from concurrent.futures import ThreadPoolExecutor

ap = argparse.ArgumentParser()
ap.add_argument("--raw", action="append", required=True)
ap.add_argument("--plan", default="docs/production/voice-master.tsv")
ap.add_argument("--out", default="public/voice")
ap.add_argument("--ids", default="")
ap.add_argument("--extra-gain", default="", help="файл «id дБ» — досыл громкости для коротких пиковых реплик")
opt = ap.parse_args()
EXTRA = {}
if opt.extra_gain:
    for l in open(opt.extra_gain):
        k, v = l.split()
        EXTRA[k] = float(v)
outdir = opt.out
workdir = tempfile.mkdtemp(prefix="voice-master-")
CHAINS = {
    "phone": "highpass=f=300,lowpass=f=3400,acompressor=threshold=-20dB:ratio=4:attack=5:release=80,aresample=8000,aresample=48000",
    "radio": "highpass=f=400,lowpass=f=2800,acompressor=threshold=-24dB:ratio=6:attack=2:release=60,acrusher=bits=10:mix=0.2",
    "voice_message": "highpass=f=100,lowpass=f=7500,acompressor=threshold=-18dB:ratio=3",
    "broadcast_tv": "highpass=f=100,lowpass=f=10000,acompressor=threshold=-18dB:ratio=4:makeup=2,aecho=0.8:0.6:40:0.15",
    "broadcast_radio": "highpass=f=150,lowpass=f=6000,acompressor=threshold=-18dB:ratio=5:makeup=3,aecho=0.8:0.5:25:0.12",
    "glass": "highpass=f=150,lowpass=f=1800,volume=-6dB,aecho=0.8:0.4:15:0.2",
    "dictaphone": "highpass=f=120,lowpass=f=7000,acompressor=threshold=-22dB:ratio=3",
}

def ff(*args):
    return subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-y", *args], capture_output=True, text=True, check=True)

def master(line):
    lid, speaker, fx, head, raw = line.rstrip("\n").split("\t")
    target = -18 if speaker == "burtsev" else (-17 if fx == "dictaphone" else -16)
    chain = CHAINS.get(fx, "highpass=f=70")
    tmp = os.path.join(workdir, lid)
    stage = (f"{chain},silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.02,areverse,"
             f"silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.05,areverse,"
             f"afade=t=in:d=0.005,areverse,afade=t=in:d=0.02,areverse,adelay={int(head)}:all=1,apad=pad_dur=0.25")
    ff("-v", "error", "-i", raw, "-ac", "1", "-ar", "48000", "-af", stage, "-c:a", "pcm_s24le", tmp + ".s1.wav")
    src = tmp + ".s1.wav"
    if fx == "voice_message":
        ff("-v", "error", "-i", src, "-c:a", "libopus", "-b:a", "16k", tmp + ".ogg")
        ff("-v", "error", "-i", tmp + ".ogg", "-ac", "1", "-ar", "48000", "-c:a", "pcm_s24le", tmp + ".s2.wav")
        src = tmp + ".s2.wav"
    if fx == "dictaphone":
        # шум «Сверчка» около −52 dBFS вторым входом
        ff("-v", "error", "-i", src, "-f", "lavfi", "-i", "anoisesrc=color=pink:amplitude=0.0025:sample_rate=48000",
           "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=first:normalize=0", "-ac", "1", "-c:a", "pcm_s24le", tmp + ".s3.wav")
        src = tmp + ".s3.wav"
    meas = ff("-i", src, "-af", f"loudnorm=I={target}:TP=-1.0:LRA=8:print_format=json", "-f", "null", "-").stderr
    m = json.loads(meas[meas.rfind("{"):meas.rfind("}") + 1])
    gain = target - float(m['input_i'])
    if float(m['input_tp']) + gain <= -1.0:
        ln = (f"loudnorm=I={target}:TP=-1.0:LRA=8:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
              f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    else:
        # пик не даёт поднять линейно: усиление + мягкий лимитер на −1,5 dBFS (запас под true peak)
        ln = f"volume={gain + 0.3 + EXTRA.get(lid, 0):.2f}dB,alimiter=limit=0.84:attack=5:release=60:level=false"
    ff("-v", "error", "-i", src, "-af", ln + ",aresample=48000", "-ac", "1", "-ar", "48000", "-c:a", "libmp3lame", "-b:a", "96k",
       os.path.join(outdir, lid + ".mp3"))
    for suf in (".s1.wav", ".s2.wav", ".s3.wav", ".ogg"):
        try: os.remove(tmp + suf)
        except FileNotFoundError: pass
    return lid

want = set(filter(None, opt.ids.split(",")))
lines = []
for row in open(opt.plan, encoding="utf-8-sig").read().splitlines()[1:]:
    lid = row.split("\t")[0]
    if want and lid not in want:
        continue
    raw = next((p for d in opt.raw for p in (f"{d}/{lid}.mp3", f"{d}/{lid}.wav") if os.path.exists(p)), None)
    if raw:
        lines.append(row + "\t" + raw)
errors = []
def safe(l):
    try: return master(l)
    except subprocess.CalledProcessError as e:
        errors.append((l.split("\t")[0], e.stderr[-300:])); return None
with ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as ex:
    done = [x for x in ex.map(safe, lines) if x]
print(f"[master] готово {len(done)}/{len(lines)}; ошибок {len(errors)}")
for e in errors[:10]: print(e)
