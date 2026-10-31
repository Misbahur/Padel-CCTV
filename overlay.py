"""
Membuat papan skor bergaya siaran TV (subtitle ASS) dari log poin,
lalu menempelkannya ke video dengan ffmpeg.

Papan yang tertempel meniru papan 300×100 di layar, diperbesar sesuai
resolusi video, lengkap dengan animasi poin dan layar pemenang.
"""
import json
import os
import random
import re
import subprocess

# warna papan (sama dengan versi layar)
C = {
    "bg": "0b2742", "row": "0f3050", "pts": "143e66", "cur": "1b4f80", "fg": "eaf2f8",
    "dim": "7f9bb5", "ball": "dcef3f", "strip": "071c31", "win": "1a4a2a", "div": "0a2238", "white": "ffffff",
}
FONT = "Barlow Condensed"


def col(h):
    return "&H%s%s%s&" % (h[4:6], h[2:4], h[0:2])


def ts(t):
    t = max(0.0, t)
    h = int(t // 3600)
    m = int(t % 3600 // 60)
    s = t % 60
    return "%d:%02d:%05.2f" % (h, m, s)


def clean(s):
    return re.sub(r"[{}\\\n\r]", "", str(s))


class Ass:
    def __init__(self, W, H, x0, y0, k):
        self.W, self.H, self.x0, self.y0, self.k = W, H, x0, y0, k
        self.lines = []

    def X(self, u):
        return self.x0 + u * self.k

    def Y(self, u):
        return self.y0 + u * self.k

    def _add(self, layer, a, b, text):
        if b - a < 0.01:
            return
        self.lines.append(f"Dialogue: {layer},{ts(a)},{ts(b)},B,,0,0,0,,{text}")

    def rect(self, layer, a, b, x, y, w, h, color, alpha=0, extra=""):
        k = self.k
        W, Hh = w * k, h * k
        self._add(layer, a, b,
                  "{\\an7\\pos(%.1f,%.1f)\\p1\\bord0\\shad0\\1c%s\\1a&H%02X&%s}m 0 0 l %.1f 0 %.1f %.1f 0 %.1f{\\p0}"
                  % (self.X(x), self.Y(y), col(color), alpha, extra, W, W, Hh, Hh))

    def circle(self, layer, a, b, cx, cy, r, color, extra="", absolute=False):
        R = r if absolute else r * self.k
        c = 0.552 * R
        px, py = (cx, cy) if absolute else (self.X(cx), self.Y(cy))
        path = (f"m {R:.1f} 0 b {R+c:.1f} 0 {2*R:.1f} {R-c:.1f} {2*R:.1f} {R:.1f} "
                f"b {2*R:.1f} {R+c:.1f} {R+c:.1f} {2*R:.1f} {R:.1f} {2*R:.1f} "
                f"b {R-c:.1f} {2*R:.1f} 0 {R+c:.1f} 0 {R:.1f} b 0 {R-c:.1f} {R-c:.1f} 0 {R:.1f} 0")
        pos = "" if "\\move" in extra else "\\pos(%.1f,%.1f)" % (px - R, py - R)
        self._add(layer, a, b, "{\\an7%s\\p1\\bord0\\shad0\\1c%s%s}%s{\\p0}" % (pos, col(color), extra, path))

    def text(self, layer, a, b, x, y, an, s, size, color, extra="", spacing=0):
        fs = size * self.k * 1.2
        self._add(layer, a, b, "{\\an%d\\pos(%.1f,%.1f)\\fn%s\\b1\\fs%.1f\\fsp%.1f\\bord0\\shad0\\1c%s%s}%s"
                  % (an, self.X(x), self.Y(y), FONT, fs, spacing * self.k, col(color), extra, clean(s)))

    def header(self):
        return ("[Script Info]\nScriptType: v4.00+\nPlayResX: %d\nPlayResY: %d\nWrapStyle: 2\n"
                "ScaledBorderAndShadow: yes\nYCbCr Matrix: TV.709\n\n"
                "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
                "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, "
                "Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
                "Style: B,%s,20,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1\n\n"
                "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
                % (self.W, self.H, FONT))

    def dump(self):
        return self.header() + "\n".join(self.lines) + "\n"


POP = "\\t(0,110,\\fscx128\\fscy128)\\t(110,320,\\fscx100\\fscy100)"


def build_ass(events, anchor, W, H, duration, ocfg):
    """events: baris log yang punya 'board' dan 'w' (waktu jam dinding)."""
    offset = float(ocfg.get("offset_seconds", 0))
    k = H / 1080 * 1.8 * float(ocfg.get("scale", 1.0))
    m = H * 0.035
    pos = ocfg.get("position", "top-left")
    bw, bh = 300 * k, 100 * k
    x0 = W - m - bw if "right" in pos else m
    y0 = H - m - bh if "bottom" in pos else m
    A = Ass(W, H, x0, y0, k)

    evs = sorted((e for e in events if e.get("board") and "w" in e), key=lambda e: e["w"])
    if not evs:
        return None
    segs = []
    for i, e in enumerate(evs):
        a = e["w"] - anchor - offset
        b = (evs[i + 1]["w"] - anchor - offset) if i + 1 < len(evs) else duration
        a, b = max(0.0, a), min(duration, b)
        if b > a:
            segs.append((a, b, e["board"], e.get("event")))
    if not segs:
        return None

    first = segs[0][2]
    n = int(first.get("cols", 0))
    am = n == 0
    ptsw = 64 if am else 54
    px = 300 - ptsw
    sx = px - 22 * n
    S, D = segs[0][0], duration

    # dasar papan (tetap)
    A.rect(0, S, D, 0, 0, 300, 100, C["bg"])
    for r in (0, 1):
        A.rect(0, S, D, 0, r * 40 + (1 if r else 0), 300, 40 - (1 if r else 0), C["row"])
        A.rect(1, S, D, px, r * 40 + (1 if r else 0), ptsw, 40 - (1 if r else 0), C["pts"])
    A.rect(1, S, D, 0, 40, 300, 1, C["div"])
    A.rect(1, S, D, 0, 80, 300, 20, C["strip"])

    prev_pts = None
    for idx, (a, b, bd, ev) in enumerate(segs):
        names = bd.get("names", ["Tim A", "Tim B"])
        winner = bd.get("winner")
        cur = bd.get("cur")
        if winner in (0, 1):
            A.rect(1, a, b, 0, winner * 40 + (1 if winner else 0), px, 40 - (1 if winner else 0), C["win"])
        if cur is not None and winner is None and 0 <= cur < n:
            for r in (0, 1):
                A.rect(2, a, b, sx + cur * 22, r * 40 + (1 if r else 0), 22, 40 - (1 if r else 0), C["cur"])
        for r in (0, 1):
            cy = r * 40 + 20.5
            if winner is None and bd.get("server") == r:
                A.circle(3, a, b, 7, cy, 3.5, C["ball"])
            ncol = C["ball"] if winner == r else (C["white"] if bd.get("lead") == r else C["fg"])
            A.text(3, a, b, 14, cy, 4, str(names[r]).upper()[:14], 17, ncol, spacing=0.5)
            for c in range(n):
                v = bd["sets"][c][r] if c < len(bd.get("sets", [])) else ""
                if v == "" or v is None:
                    continue
                won = bd.get("won", [[None, None]] * n)[c][r] if c < len(bd.get("won", [])) else False
                is_cur = c == cur and winner is None
                ccol = C["fg"] if (won or is_cur) else C["dim"]
                size = 15 if len(str(v)) > 1 else 19
                A.text(3, a, b, sx + c * 22 + 11, cy, 5, v, size, ccol)
            p = bd.get("pts", ["", ""])[r]
            if p != "":
                pop = POP if (prev_pts is not None and prev_pts[r] != p) else ""
                A.text(4, a, b, px + ptsw / 2, cy, 5, p, 24 if p == "AD" else 28, C["ball"], pop)
        prev_pts = bd.get("pts", ["", ""])

        # strip bawah
        A.text(3, a, b, 8, 90.5, 4, str(bd.get("left", "")).upper(), 11, C["dim"], spacing=1.3)
        status = str(bd.get("status", "")).upper()
        fl = bd.get("flash")
        if fl and ev == "poin":
            fe = min(b, a + 1.8)
            w = min(150, len(fl) * 7 + 14)
            A.rect(3, a, fe, 300 - w, 80, w, 20, C["ball"], extra="\\fad(80,300)")
            A.text(4, a, fe, 292, 90.5, 6, fl.upper(), 11, C["bg"], spacing=1.3)
            A.text(3, fe, b, 292, 90.5, 6, status, 11, C["ball"], spacing=1.3)
        else:
            A.text(3, a, b, 292, 90.5, 6, status, 11, C["ball"], spacing=1.3)

        # layar pemenang + animasi
        if winner is not None and idx == len(segs) - 1:
            A.rect(5, a, b, 0, 0, 300, 100, C["strip"], alpha=0x30, extra="\\fad(450,0)")
            label = "HASIL" if winner == 2 else "PEMENANG"
            wname = "SERI" if winner == 2 else str(names[winner]).upper()
            A.text(6, a, b, 150, 22, 5, label, 10, C["dim"], "\\fad(450,0)", spacing=3)
            pulse = "".join("\\t(%d,%d,\\fscx114\\fscy114)\\t(%d,%d,\\fscx100\\fscy100)"
                            % (400 + i * 800, 800 + i * 800, 800 + i * 800, 1200 + i * 800) for i in range(3))
            A.text(6, a, b, 150, 49, 5, wname[:16], 30, C["ball"], "\\fad(450,0)" + pulse, spacing=1)
            A.text(6, a, b, 150, 75, 5, bd.get("summary", ""), 13, C["fg"], "\\fad(450,0)", spacing=1)
            rnd = random.Random(7)
            clip = "\\clip(%d,%d,%d,%d)" % (x0, y0, x0 + bw, y0 + bh)
            cx, cy = A.X(150), A.Y(55)
            for i in range(46):
                ex = A.X(rnd.uniform(4, 296))
                ey = A.Y(rnd.uniform(70, 99))
                d0 = rnd.randint(0, 250)
                d1 = d0 + rnd.randint(900, 1700)
                colr = [C["ball"], C["ball"], C["white"], "5fb4dc"][i % 4]
                rr = rnd.uniform(1.2, 2.6) * k
                mv = "\\move(%.1f,%.1f,%.1f,%.1f,%d,%d)" % (cx - rr, cy - rr, ex - rr, ey - rr, d0, d1)
                A.circle(7, a, min(b, a + 3.2), 0, 0, rr, colr, extra=mv + clip + "\\fad(0,900)", absolute=True)
    return A.dump()


def probe(ffprobe, path):
    out = subprocess.run([ffprobe, "-v", "error", "-select_streams", "v:0", "-show_entries",
                          "stream=width,height:format=duration", "-of", "json", path],
                         capture_output=True, text=True, timeout=30)
    d = json.loads(out.stdout or "{}")
    st = (d.get("streams") or [{}])[0]
    return int(st.get("width", 1920)), int(st.get("height", 1080)), float(d.get("format", {}).get("duration", 0) or 0)


def find_log(video):
    """Cari file _poin.jsonl milik video dan bagian nama file video sesudahnya."""
    folder, name = os.path.split(os.path.abspath(video))
    best = None
    for f in os.listdir(folder):
        if f.endswith("_poin.jsonl"):
            pre = f[:-len("_poin.jsonl")]
            if name.startswith(pre) and (best is None or len(pre) > len(best[1])):
                best = (os.path.join(folder, f), pre)
    if not best:
        return None, None
    return best[0], name[len(best[1]):]


def load_log(path):
    evs = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    evs.append(json.loads(line))
                except ValueError:
                    pass
    return evs


def anchor_for(evs, suffix):
    for e in evs:
        if e.get("event") == "video" and e.get("suffix") == suffix:
            return e.get("anchor")
    return None


def render(video, cfg, progress=None):
    """Buat <video>.ass dan <video>_skor.mp4. Mengembalikan path hasil."""
    ocfg = cfg.get("overlay", {})
    log, suffix = find_log(video)
    if not log:
        raise RuntimeError("File _poin.jsonl untuk video ini tidak ditemukan")
    evs = load_log(log)
    anchor = anchor_for(evs, suffix)
    if anchor is None:
        # cadangan: anggap video mulai saat tombol Main ditekan
        st = next((e for e in evs if e.get("event") == "mulai"), None)
        if not st:
            raise RuntimeError("Log tidak berisi waktu mulai")
        anchor = st["w"]
    W, H, dur = probe(cfg.get("ffprobe", "ffprobe"), video)
    ass = build_ass(evs, anchor, W, H, dur, ocfg)
    if not ass:
        raise RuntimeError("Tidak ada data papan skor di log")
    base = os.path.splitext(video)[0]
    ass_path = base + ".ass"
    with open(ass_path, "w", encoding="utf-8-sig") as f:
        f.write(ass)
    out = base + "_skor.mp4"
    folder = os.path.dirname(os.path.abspath(video))
    fonts = os.path.join(folder, "_fonts")
    parent_fonts = os.path.join(os.path.dirname(folder), "_fonts")
    vf = "ass=%s" % os.path.basename(ass_path)
    if os.path.isdir(fonts):
        vf += ":fontsdir=_fonts"
    elif os.path.isdir(parent_fonts):
        vf += ":fontsdir=../_fonts"
    cmd = [cfg.get("ffmpeg", "ffmpeg"), "-hide_banner", "-loglevel", "error", "-y",
           "-i", os.path.basename(video), "-vf", vf,
           "-c:v", "libx264", "-preset", ocfg.get("preset", "veryfast"), "-crf", str(ocfg.get("crf", 21)),
           "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart",
           "-progress", "pipe:1", "-nostats", os.path.basename(out) + ".tmp.mp4"]
    p = subprocess.Popen(cmd, cwd=folder, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    for line in p.stdout:
        if line.startswith("out_time_us=") and dur > 0 and progress:
            try:
                progress(min(99, int(int(line.split("=")[1]) / 1e6 / dur * 100)))
            except ValueError:
                pass
    err = p.stderr.read()
    p.wait()
    tmp = os.path.join(folder, os.path.basename(out) + ".tmp.mp4")
    if p.returncode != 0:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise RuntimeError((err.strip().splitlines() or ["ffmpeg gagal"])[-1][:200])
    os.replace(tmp, out)
    if progress:
        progress(100)
    return out
