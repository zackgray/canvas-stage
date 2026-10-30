"""Face detail pass, the free steps after the paid window render (a port of experiments/e143_paste.py, arm s). Run by server/l2r/facePass.ts:
  python face_paste.py paste <plan.json>   the window render pasted back into every frame of the render -> plan.afterRaw
  python face_paste.py crops <plan.json>   100 % crops of the window at frame 0 and where the face is largest, before beside after
plan.json: {raw, win, dir, afterRaw, before, after, beforeCrop, afterCrop}; dir holds face_track.py's track.json, window.json, win-raw.mp4.
Paste, per frame: the window render's shift against the raw window, measured on the head WITHOUT the face (hat, ears, collar: the parts
both share; ECC translation, smoothed); blur 0.45 x scale, back to 1920 at the window's sub-pixel place; the face's mean Lab colour matched
to the raw's (smoothed over time); grain topped up to 0.6 of the raw's (the full top-up read as speckle); blended through a feathered
face-only ellipse (sigma 0.1 x face width). Everything outside the ellipse stays the raw's pixels."""
import json, os, sys
import cv2, numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from face_track import WIN_OUT, encode, frames_of, smooth  # noqa: E402

GRAIN_SHARE = 0.6


def ellipse(shape, cx, cy, fw, fh, grow=1.0):
    m = np.zeros(shape, np.float32)
    cv2.ellipse(m, (int(round(cx * 8)), int(round((cy + 0.08 * fh) * 8))), (int(0.55 * fw * grow * 8), int(0.53 * fh * grow * 8)), 0, 0, 360, 1.0, -1, cv2.LINE_AA, 3)
    return m


def grey(im):
    return cv2.GaussianBlur(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255, (0, 0), 3)


def shift_of(raw_win, new_win, face_win):
    """ECC translation of new against raw on the head ring around the face (in window px) -> (dx, dy, cc)"""
    cx, cy, fw, fh = face_win
    m = np.zeros(raw_win.shape[:2], np.uint8)
    cv2.rectangle(m, (int(cx - 1.3 * fw), int(cy - 1.5 * fh)), (int(cx + 1.3 * fw), int(cy + 1.4 * fh)), 255, -1)
    m[ellipse(m.shape, cx, cy, fw, fh, 1.15) > 0] = 0
    warp = np.eye(2, 3, dtype=np.float32)
    try:
        cc, warp = cv2.findTransformECC(grey(raw_win), grey(new_win), warp, cv2.MOTION_TRANSLATION, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-5), m, 5)
    except cv2.error:
        return 0.0, 0.0, 0.0
    return float(warp[0, 2]), float(warp[1, 2]), float(cc)


def face_in_win(face, box, win):
    s = WIN_OUT / win
    return ((face[0] - box[0]) * s, (face[1] - box[1]) * s, face[2] * s, face[3] * s)


def align(raw_wins, new_wins, faces, boxes, win):
    rows = [shift_of(a, b, face_in_win(f, bx, win)) for a, b, f, bx in zip(raw_wins, new_wins, faces, boxes)]
    if not rows: raise SystemExit('the window render has no frames')
    if len(rows) != len(faces): raise SystemExit(f'the window render has {len(rows)} frames, the track {len(faces)}')
    dx, dy = smooth([r[0] for r in rows], 1.5), smooth([r[1] for r in rows], 1.5)
    return [(float(a), float(b), r[2]) for a, b, r in zip(dx, dy, rows)]


def roi_of(box, win, w, h):
    x0, y0 = max(0, int(np.floor(box[0])) - 2), max(0, int(np.floor(box[1])) - 2)
    return x0, y0, min(w, int(np.ceil(box[0] + win)) + 2), min(h, int(np.ceil(box[1] + win)) + 2)


def prep(o, nw, box, face, shift, win):
    """the window render moved onto the raw window (ECC: new(x + d) ~ raw(x)), area-filtered back to the frame inside the window's
    region only -> (roi, raw roi, new roi in Lab, feathered mask, core)"""
    S = WIN_OUT / win; h, w = o.shape[:2]
    rx0, ry0, rx1, ry1 = roi_of(box, win, w, h)
    sh = np.array([[1, 0, shift[0]], [0, 1, shift[1]]], np.float32)
    nw = cv2.warpAffine(nw, sh, (WIN_OUT, WIN_OUT), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
    nw = cv2.GaussianBlur(nw, (0, 0), 0.45 * S)  # anti-alias before the reduction
    M = np.array([[1 / S, 0, box[0] - rx0], [0, 1 / S, box[1] - ry0]], np.float32)
    full = cv2.warpAffine(nw, M, (rx1 - rx0, ry1 - ry0), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT).astype(np.float32)
    m = ellipse((ry1 - ry0, rx1 - rx0), face[0] - rx0, face[1] - ry0, face[2], face[3])
    m = cv2.GaussianBlur(m, (0, 0), max(0.5, 0.10 * face[2]))
    oo = o[ry0:ry1, rx0:rx1].astype(np.float32)
    return (rx0, ry0, rx1, ry1), oo, cv2.cvtColor(np.clip(full / 255, 0, 1), cv2.COLOR_BGR2LAB), m, m > 0.5


def lab_delta(oo, ln, core):
    if not core.any(): return np.zeros(3)
    return cv2.cvtColor(oo / 255, cv2.COLOR_BGR2LAB)[core].mean(0) - ln[core].mean(0)


def mad(v):
    return 1.4826 * float(np.median(np.abs(v - np.median(v)))) if v.size else 0.0


def blend(oo, ln, m, core, d, rng):
    nb = cv2.cvtColor(ln + np.asarray(d, np.float32), cv2.COLOR_LAB2BGR) * 255
    hp = lambda im: im - cv2.GaussianBlur(im, (0, 0), 1.0)
    ring = (cv2.dilate(core.astype(np.uint8), np.ones((15, 15), np.uint8)) > 0) & ~core
    g_raw = mad(hp(cv2.cvtColor(oo, cv2.COLOR_BGR2GRAY))[ring]); g_new = mad(hp(cv2.cvtColor(nb.astype(np.float32), cv2.COLOR_BGR2GRAY))[core])
    add = GRAIN_SHARE * np.sqrt(max(0.0, g_raw ** 2 - g_new ** 2))
    if add > 0: nb = nb + rng.normal(0, add, nb.shape[:2]).astype(np.float32)[..., None]
    mm = m[..., None]
    return np.clip(oo * (1 - mm) + nb * mm + 0.5, 0, 255).astype(np.uint8)


def load(dir_):
    t = json.load(open(os.path.join(dir_, 'track.json'))); wj = json.load(open(os.path.join(dir_, 'window.json')))
    return [r['face'] for r in t['rows']], wj['boxes'], wj['win']


def cmd_paste(p):
    faces, boxes, win = load(p['dir'])
    al = align(frames_of(os.path.join(p['dir'], 'win-raw.mp4')), frames_of(p['win']), faces, boxes, win)
    # pass 1: the colour shift per frame (smoothed over time so the face does not flicker); pass 2: blend and write
    D = []
    for o, nw, b, f, a in zip(frames_of(p['raw']), frames_of(p['win']), boxes, faces, al):
        _, oo, ln, _, core = prep(o, nw, b, f, a, win)
        D.append(lab_delta(oo, ln, core))
    D = np.stack([smooth(np.array(D)[:, c], 2.0) for c in range(3)], 1)
    rng = np.random.default_rng(143)

    def out():
        for f, (o, nw) in enumerate(zip(frames_of(p['raw']), frames_of(p['win']))):
            (x0, y0, x1, y1), oo, ln, m, core = prep(o, nw, boxes[f], faces[f], al[f], win)
            res = o.copy(); res[y0:y1, x0:x1] = blend(oo, ln, m, core, D[f], rng)
            yield res
    first = next(frames_of(p['raw']))
    n = encode(out(), p['afterRaw'], first.shape[1], first.shape[0], crf=12)
    if n != len(faces): raise SystemExit(f'pasted {n} frames, the track has {len(faces)}')
    json.dump(dict(frames=n, meanShiftFullPx=[round(float(np.mean([a[0] for a in al])) / (WIN_OUT / win), 2), round(float(np.mean([a[1] for a in al])) / (WIN_OUT / win), 2)],
                   meanCC=round(float(np.mean([a[2] for a in al])), 3)), open(os.path.join(p['dir'], 'paste.json'), 'w'))
    print(json.dumps(dict(frames=n)))


def native(im, box, win):
    """the window at its own pixels (no scaling): a 100 % crop, edges padded"""
    x0, y0, s = int(round(box[0])), int(round(box[1])), int(round(win))
    pad = cv2.copyMakeBorder(im, s, s, s, s, cv2.BORDER_REPLICATE)
    return pad[y0 + s:y0 + 2 * s, x0 + s:x0 + 2 * s]


def crops_of(frames, picks, boxes, win):
    return np.concatenate([native(frames[f], boxes[f], win) for f in picks], 1)


def cmd_crops(p):
    faces, boxes, win = load(p['dir'])
    picks = sorted({0, int(np.argmax([f[3] for f in faces]))})
    for src, dst in ((p['before'], p['beforeCrop']), (p['after'], p['afterCrop'])):
        kept = {f: im for f, im in enumerate(frames_of(src)) if f in picks}
        if len(kept) != len(picks): raise SystemExit(f'{os.path.basename(src)} is shorter than the track')
        cv2.imwrite(dst, crops_of(kept, picks, boxes, win))
    print(json.dumps(dict(frames=picks, win=win)))


if __name__ == '__main__':
    if len(sys.argv) < 3 or sys.argv[1] not in ('paste', 'crops'): sys.exit(__doc__)
    (cmd_paste if sys.argv[1] == 'paste' else cmd_crops)(json.load(open(sys.argv[2])))
