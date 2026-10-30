"""Face detail pass, the free steps before the paid window render (recipe step 6; a port of experiments/e143_track.py, arm s).
Run by server/l2r/faceTrack.ts with CANVAS_PYTHON / LIFT_PYTHON (cv2 + numpy; ffmpeg on PATH for `window`):
  python face_track.py track  <plan.json>   one person's head on every frame -> <out>/track.json, <out>/strip.png
  python face_track.py window <plan.json>   the fixed square window that follows it -> <out>/win-raw.mp4, still-win.png,
                                            face-mask-win.png (the Klein face mask), window.json
plan.json: {raw, clayDir, frames, idFrames, color, unitM, yunet, still, out, stripFrames}
Track: the person's silhouette from the clay's planar depth (the band at their own distance, seeded from the ID pass at its keyframes),
head = the top 13 % of it; then YuNet on the RENDER around that head. The render's person can stand off the clay's marks (E143: up to
18 px early on), so the window follows YuNet, smoothed (sigma 2 frames). Too few YuNet hits fails loudly (ok false + why)."""
import json, os, subprocess, sys
import cv2, numpy as np

WIN_OUT = 1088     # the window render's size (stage 1 at 544)
FACE_Y = 0.40      # the face centre sits this far down the window: hat above, collar below
WIN_PER_FACE = 4.0  # window side = 4x the face height at frame 0 (E143: 200 px for a ~50 px face)
WIN_MIN, WIN_MAX = 128, 1088
BAND_M = 0.45      # the depth band around the person's own distance
MIN_HITS = 0.9     # YuNet must find the face on this share of frames


def frames_of(path):
    cap = cv2.VideoCapture(path)
    while True:
        ok, im = cap.read()
        if not ok: break
        yield im


def encode(ims, path, w, h, fps=24, crf=10):
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{w}x{h}', '-r', f'{fps:g}', '-i', '-',
                          '-c:v', 'libx264', '-crf', str(crf), '-preset', 'slow', '-pix_fmt', 'yuv420p', path], stdin=subprocess.PIPE)
    n = 0
    for im in ims: p.stdin.write(np.ascontiguousarray(im).tobytes()); n += 1
    p.stdin.close()
    if p.wait() != 0: sys.exit(f'ffmpeg failed writing {path}')
    return n


def smooth(v, sigma):
    """Gaussian over time; the ends are padded by point reflection so a steady walk is not bent toward its first / last frame"""
    v = np.asarray(v, np.float64); n = len(v); k = int(np.ceil(3 * sigma))
    if n < 2: return v.copy()
    i = np.clip(np.arange(1, k + 1), 0, n - 1)
    pad = np.concatenate([2 * v[0] - v[i][::-1], v, 2 * v[-1] - v[n - 1 - i]])
    g = np.exp(-0.5 * (np.arange(-k, k + 1) / sigma) ** 2); g /= g.sum()
    return np.convolve(pad, g, mode='valid')


def person_mask(id_bgr, color, tol=30):
    return np.abs(id_bgr[..., ::-1].astype(int) - np.array(color)).sum(-1) < tol


def head_of(m):
    ys, xs = np.where(m)
    top, bot = int(ys.min()), int(ys.max()); hb = max(2, int(round((bot - top) * 0.13)))
    hx = np.where(m[top:top + hb].any(0))[0]
    return dict(top=top, bot=bot, headH=hb, cx=float((hx.min() + hx.max()) / 2), x0=int(xs.min()), x1=int(xs.max()))


def keys_from(id_masks, depths_m):
    """{frame: id mask} + {frame: depth in metres} -> the person's distance and box at each ID keyframe that shows them"""
    out = {}
    for f, m in id_masks.items():
        if m.sum() < 40: continue
        out[f] = dict(z=float(np.median(depths_m[f][m])), **head_of(m))
    if not out: raise SystemExit('the ID pass never shows this person: export the clay again in Shoot')
    return out


def body_head(depth_m, f, keys, band_m=BAND_M):
    """the person's head at frame f: the depth band at their distance (fitted over the keys), inside the keys' box, largest blob"""
    kf = sorted(keys)
    deg = min(2, len(kf) - 1)
    z = float(np.polyval(np.polyfit(kf, [keys[k]['z'] for k in kf], deg), f)) if deg > 0 else keys[kf[0]]['z']
    lo = max([k for k in kf if k <= f], default=kf[0]); hi = min([k for k in kf if k >= f], default=kf[-1])
    t = 0.0 if hi == lo else (f - lo) / (hi - lo)
    lerp = lambda a: keys[lo][a] * (1 - t) + keys[hi][a] * t
    band = (np.abs(depth_m - z) < band_m) & (depth_m > 0)
    x0, x1, bot = int(lerp('x0')) - 40, int(lerp('x1')) + 40, int(lerp('bot')) + 30
    band[:, :max(0, x0)] = False; band[:, max(0, x1):] = False; band[max(0, bot):] = False
    n, lab, st, _ = cv2.connectedComponentsWithStats(band.astype(np.uint8))
    if n < 2: return None
    h = head_of(lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))); h['z'] = round(z, 3)
    return h


class YuNet:
    """the most confident face in a region twice the head box around it, upscaled so the face is big enough for YuNet's anchors"""
    def __init__(self, model):
        if not os.path.exists(model): raise SystemExit(f'the face finder (YuNet) is not at {model}')
        self.det = cv2.FaceDetectorYN.create(model, '', (320, 320), 0.6, 0.3, 5000)

    def __call__(self, img, box):
        x0, y0, x1, y1 = box; cx, cy, r = (x0 + x1) / 2, (y0 + y1) / 2, max(x1 - x0, y1 - y0)
        ox, oy = int(max(0, cx - r)), int(max(0, cy - r))
        im = img[oy:int(min(img.shape[0], cy + r)), ox:int(min(img.shape[1], cx + r))]
        if im.size == 0: return None
        s = max(1.0, 640 / max(im.shape[:2]))
        im2 = cv2.resize(im, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC if s > 1 else cv2.INTER_AREA)
        self.det.setInputSize((im2.shape[1], im2.shape[0])); _, f = self.det.detect(im2)
        if f is None or not len(f): return None
        f = f[np.argmax(f[:, -1])]
        return (float(f[0] / s + ox), float(f[1] / s + oy), float(f[2] / s), float(f[3] / s), float(f[-1]))


def fill(vals):
    """None gaps interpolated from the frames either side (held at the ends)"""
    idx = [i for i, v in enumerate(vals) if v is not None]
    return np.interp(np.arange(len(vals)), idx, [vals[i] for i in idx])


def track_rows(raw, depths_m, keys, detect, n):
    """raw: the render's frames in order (an iterator: a long take is never all in memory); depths_m: indexable per frame.
    -> (rows, summary). Each row: the clay head and YuNet's face box on the render."""
    rows, last, f = [], None, -1
    for f, im in enumerate(raw):
        if f >= n: raise SystemExit(f'the render has more than {n} frames')
        h = body_head(depths_m[f], f, keys) or last
        if h is None: raise SystemExit(f'the person is not in the clay depth at frame {f}')
        last = h
        hb = (h['cx'] - h['headH'], h['top'], h['cx'] + h['headH'], h['top'] + 2 * h['headH'])
        fc = detect(im, hb)
        rows.append(dict(f=f, clayHead=[round(h['cx'], 2), h['top'], h['headH']],
                         yunet=None if fc is None else dict(cx=round(fc[0] + fc[2] / 2, 2), cy=round(fc[1] + fc[3] / 2, 2), w=round(fc[2], 2), h=round(fc[3], 2), score=round(fc[4], 3))))
    if f + 1 != n: raise SystemExit(f'the render has {f + 1} frames, expected {n}')
    hits = [r for r in rows if r['yunet']]
    ok = len(hits) >= MIN_HITS * n
    summary = dict(frames=n, hits=len(hits), ok=ok)
    if not ok:
        summary['why'] = f'the face was found on only {len(hits)} of {n} frames (a turned head, a hand or steam across it, or too small)'
        return rows, summary
    g = lambda k: fill([r['yunet'][k] if r['yunet'] else None for r in rows])
    cx, cy, fw, fh = smooth(g('cx'), 2.0), smooth(g('cy'), 2.0), smooth(g('w'), 2.0), smooth(g('h'), 2.0)
    for r, a, b, c, d in zip(rows, cx, cy, fw, fh): r['face'] = [round(float(a), 2), round(float(b), 2), round(float(c), 2), round(float(d), 2)]
    summary.update(faceH=[rows[0]['face'][3], round(float(fh.max()), 2)], largest=int(np.argmax(fh)))
    return rows, summary


def window_size(face_h0, face_hmax):
    """fixed for the shot: ~4x the face at frame 0, never so tight the largest face leaves no hat or collar; even px"""
    w = max(WIN_PER_FACE * face_h0, 1.8 * face_hmax)
    return int(min(WIN_MAX, max(WIN_MIN, 2 * round(w / 2))))


def win_boxes(rows, win):
    return [(r['face'][0] - win / 2, r['face'][1] - FACE_Y * win) for r in rows]


def crop(im, x0, y0, win, out=WIN_OUT, interp=cv2.INTER_LANCZOS4):
    """the win-square at sub-pixel (x0, y0) of im, resampled to out x out"""
    s = out / win
    M = np.array([[s, 0, -x0 * s], [0, s, -y0 * s]], np.float32)
    return cv2.warpAffine(im, M, (out, out), flags=interp, borderMode=cv2.BORDER_REPLICATE)


def face_mask_win(face, box, win, out=WIN_OUT):
    """the Klein mask in window pixels: the face only (E141's tight ellipse, under a hat's brim)"""
    s = out / win; cx, cy, fw, fh = (face[0] - box[0]) * s, (face[1] - box[1]) * s, face[2] * s, face[3] * s
    m = np.zeros((out, out), np.uint8)
    cv2.ellipse(m, (int(cx), int(cy + 0.08 * fh)), (int(0.55 * fw), int(0.53 * fh)), 0, 0, 360, 255, -1)
    return m


def strip_of(frames, rows, picks, cell=128):
    """the face at a few frames side by side (frames: {frame: image}), each a square of 2.4x the face height scaled to `cell`"""
    out = []
    for f in picks:
        cx, cy, _, fh = rows[f]['face']; side = max(8.0, 2.4 * fh)
        out.append(crop(frames[f], cx - side / 2, cy - side / 2, side, cell, cv2.INTER_CUBIC))
    return np.concatenate(out, 1)


def load_plan(p):
    plan = json.load(open(p)); os.makedirs(plan['out'], exist_ok=True)
    return plan


def depth_m(plan, f):
    d = cv2.imread(os.path.join(plan['clayDir'], f'zdepth_{f:03d}.png'), cv2.IMREAD_UNCHANGED)
    if d is None: raise SystemExit(f"the clay's depth of frame {f} is missing")
    return d.astype(np.float32) * plan['unitM']


def cmd_track(plan):
    n = plan['frames']
    ids = {f: person_mask(cv2.imread(os.path.join(plan['clayDir'], f'id_{f:03d}.png')), plan['color']) for f in plan['idFrames']}
    keys = keys_from(ids, {f: depth_m(plan, f) for f in ids})
    picks = sorted({min(n - 1, f) for f in plan.get('stripFrames', [0, 24, 40, n - 1])})
    kept = {}
    def seen():  # the strip's frames are kept as they stream past
        for f, im in enumerate(frames_of(plan['raw'])):
            if f in picks: kept[f] = im
            yield im
    rows, summary = track_rows(seen(), _Lazy(lambda f: depth_m(plan, f)), keys, YuNet(plan['yunet']), n)
    if summary['ok']:
        cv2.imwrite(os.path.join(plan['out'], 'strip.png'), strip_of(kept, rows, picks)); summary['strip'] = picks
    json.dump(dict(summary=summary, rows=rows, source=plan.get('sourceKey', os.path.basename(plan['raw']))), open(os.path.join(plan['out'], 'track.json'), 'w'), indent=1)
    print(json.dumps(summary))


class _Lazy:
    def __init__(self, fn): self.fn = fn
    def __getitem__(self, f): return self.fn(f)


def cmd_window(plan):
    t = json.load(open(os.path.join(plan['out'], 'track.json')))
    if not t['summary']['ok']: raise SystemExit(t['summary'].get('why', 'the track failed'))
    rows = t['rows']; win = window_size(rows[0]['face'][3], max(r['face'][3] for r in rows)); boxes = win_boxes(rows, win)
    n = encode((crop(im, *b, win) for im, b in zip(frames_of(plan['raw']), boxes)), os.path.join(plan['out'], 'win-raw.mp4'), WIN_OUT, WIN_OUT)
    if n != len(rows): raise SystemExit(f'the render gave {n} frames, the track {len(rows)}')
    still = cv2.imread(plan['still'])
    if still is None: raise SystemExit('the approved still is not on disk')
    if still.shape[1] != 1920: still = cv2.resize(still, (1920, 1088), interpolation=cv2.INTER_LANCZOS4)  # window boxes are in 1920 px
    cv2.imwrite(os.path.join(plan['out'], 'still-win.png'), crop(still, *boxes[0], win))
    cv2.imwrite(os.path.join(plan['out'], 'face-mask-win.png'), face_mask_win(rows[0]['face'], boxes[0], win))
    json.dump(dict(win=win, out=WIN_OUT, faceY=FACE_Y, boxes=[[round(a, 2), round(b, 2)] for a, b in boxes]), open(os.path.join(plan['out'], 'window.json'), 'w'))
    print(json.dumps(dict(win=win, box0=boxes[0])))


if __name__ == '__main__':
    if len(sys.argv) < 3 or sys.argv[1] not in ('track', 'window'): sys.exit(__doc__)
    (cmd_track if sys.argv[1] == 'track' else cmd_window)(load_plan(sys.argv[2]))
