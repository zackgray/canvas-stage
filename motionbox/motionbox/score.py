"""The eight checks every try is scored on (plan section 3), run on the SOMA output before retargeting.

Hard-failed tries never leave the box. Survivors are ranked by a weighted sum (WEIGHTS below);
each try's plain-words reason names the check it did best on. Metrics reuse the spike judge's
definitions (Y up, metres, 30 fps): slide_cms, jitter_mm, grip over the grab window.
"""
import numpy as np
from scipy.signal import savgol_filter

from .soma import S77

FPS = 30
I = S77.idx

# check name -> (metric key, rank weight, plain-words reason when it is the try's best check)
WEIGHTS = {"grip": 3.0, "keys": 3.0, "slide": 2.0, "end": 2.0, "jitter": 1.0, "travel": 1.0}
METRIC_KEY = {"grip": "grip_std_m", "keys": "keys_err_m", "slide": "slide_cms",
              "end": "end_err_m", "jitter": "jitter_mm", "travel": "root_travel_m"}
REASONS = {"grip": "steadiest hands", "keys": "closest to the piece", "slide": "cleanest feet",
           "end": "held to the end", "jitter": "smoothest arms", "travel": "stayed on the spot"}
# hard-fail reason shown as "N of M dropped because ..."
DROPPED = {"grip": "the hands didn't hold the object steadily", "keys": "the hands missed their marks",
           "slide": "the feet slid", "start": "the start wasn't standing",
           "through": "the hands went through the piece", "end": "the move sagged at the end",
           "jitter": "the arms shook", "travel": "the person drifted off the spot",
           "length": "the move came out the wrong length", "still": "the person barely moved"}

# the checks a loosened run (free words, no hand targets) only reports instead of dropping: the standing start, drift off the
# spot, foot slide and arm shake were discarding the model's best tries (a cartwheel, a stumble). Only "still" stays hard.
SOFT = ("start", "travel", "slide", "jitter")
STILL_M = 0.15   # no joint travels or bends further than this over the clip: the try is a statue


def _slide(P, contacts):
    feet = [I[n] for n in ("LeftFoot", "LeftToeBase", "LeftToeEnd", "RightFoot", "RightToeBase", "RightToeEnd")][: contacts.shape[1]]
    v = np.linalg.norm(np.diff(P[:, feet][:, :, [0, 2]], axis=0), axis=-1) * FPS
    c = contacts[1:, : len(feet)] & contacts[:-1, : len(feet)]
    return float(v[c].mean() * 100) if c.any() else 0.0


def _jitter(P):
    out = []
    for w in (P[:, I["LeftHand"]], P[:, I["RightHand"]]):
        sm = savgol_filter(w, 9, 3, axis=0)
        out.append(np.sqrt(((w - sm) ** 2).sum(-1).mean()) * 1000)
    return float(np.mean(out))


def analyze(P: np.ndarray, contacts: np.ndarray, spec: dict, loosen: bool = False) -> dict:
    """Run the eight checks on one try. Returns metric values + hard-fail reasons (None if it survives).

    `loosen` (free words, no hand targets) turns the SOFT checks into "would_drop" notes on a try that still survives; a try
    that never moves is still dropped."""
    T = P.shape[0]
    floor = P[:, [I["LeftToeBase"], I["RightToeBase"], I["LeftFoot"], I["RightFoot"]], 1].min()
    H = P[:, :, 1] - floor
    lw, rw = P[:, I["LeftHand"]], P[:, I["RightHand"]]
    m = {"frames": T, "slide_cms": round(_slide(P, contacts), 2), "jitter_mm": round(_jitter(P), 2),
         "root_travel_m": round(float(np.linalg.norm(P[-1, 0, [0, 2]] - P[0, 0, [0, 2]])), 3)}
    fails = []
    # 4. standing start: frame-0 hip height vs the clip's tallest, and frame-0 torso tilt
    hip = H[:, I["Hips"]]
    torso = P[:, I["Neck1"]] - P[:, I["Hips"]]
    tilt0 = float(np.degrees(np.arccos(np.clip(torso[0, 1] / np.linalg.norm(torso[0]), -1, 1))))
    m["start_hip_ratio"] = round(float(hip[0] / max(hip.max(), 1e-6)), 3)
    m["start_tilt_deg"] = round(tilt0, 1)
    if m["start_hip_ratio"] < 0.92 or tilt0 > 15.0:
        fails.append("start")
    # 8. duration and drift
    asked = int(round(spec.get("seconds", T / FPS) * FPS))
    if abs(T - asked) > 1:
        fails.append("length")
    if m["root_travel_m"] > 0.25:
        fails.append("travel")
    # 3. foot slide / 7. arm jitter
    if m["slide_cms"] > 4.0:
        fails.append("slide")
    if m["jitter_mm"] > 4.0:
        fails.append("jitter")
    keys = spec.get("keys") or []
    grab = spec.get("grab"); release = spec.get("release")
    if keys:
        # 1. grip held over the grab window, vs the asked grip (the grab key's hand spacing)
        g0 = next((k for k in keys if grab is not None and abs(k["frame"] / FPS - grab) < 1e-6), keys[0])
        asked_grip = float(np.linalg.norm(np.array(g0["hands"]["Left"]) - np.array(g0["hands"]["Right"])))
        w = slice(int(round((grab or 0) * FPS)), min(T, int(round((release or T / FPS) * FPS)) + 1))
        d = np.linalg.norm(lw - rw, axis=-1)[w]
        m["grip_asked_m"] = round(asked_grip, 3)
        m["grip_mean_m"] = round(float(d.mean()), 3) if d.size else None
        m["grip_std_m"] = round(float(d.std()), 3) if d.size else None
        if d.size and (abs(d.mean() - asked_grip) > 0.05 or d.std() > 0.03):
            fails.append("grip")
        # 2. hands hit the keys
        errs = []
        for k in keys:
            f = min(int(k["frame"]), T - 1)
            errs += [float(np.linalg.norm(P[f, I[s + "Hand"]] - np.array(k["hands"][s]))) for s in ("Left", "Right")]
        m["keys_err_m"] = round(float(np.mean(errs)), 3)
        if any(e > 0.08 for e in errs):
            fails.append("keys")
        # 6. end pose: hands still at the last key
        last = keys[-1]; f = min(int(last["frame"]), T - 1)
        end_errs = [float(np.linalg.norm(P[-1, I[s + "Hand"]] - np.array(last["hands"][s]))) for s in ("Left", "Right")]
        m["end_err_m"] = round(float(np.mean(end_errs)), 3)
        m["end_key_err_m"] = round(float(np.mean([float(np.linalg.norm(P[f, I[s + "Hand"]] - np.array(last["hands"][s]))) for s in ("Left", "Right")])), 3)
        if m["end_err_m"] > 0.08:
            fails.append("end")
        # 5. hands through the piece's walls (opening allowed), outside the grab window
        inside = _through_piece(P, spec.get("prop"), grab or 0.0, release if release is not None else 1e9)
        m["through_frames"] = int(inside)
        if inside > 6:
            fails.append("through")
    if loosen and not keys:
        m["motion_range_m"] = round(float(np.linalg.norm(P.max(axis=0) - P.min(axis=0), axis=-1).max()), 3)
        soft = [f for f in fails if f in SOFT]
        fails = [f for f in fails if f not in SOFT]
        if m["motion_range_m"] < STILL_M:
            fails.append("still")
        return {"metrics": m, "failed": fails or None, "would_drop": soft}
    return {"metrics": m, "failed": fails or None, "would_drop": []}


def _through_piece(P, prop, grab, release):
    """Frames a wrist spends inside a container's side walls (|x| ~ width/2, below the rim, at the piece)."""
    if not prop or prop.get("rimOrTop") is None or prop.get("front") is None or not prop.get("width"):
        return 0
    half, rim, front = prop["width"] / 2, prop["rimOrTop"], prop["front"]
    t = 0.03  # wall thickness
    lo = grab is None and release is None  # no grab window: count everything
    n = 0
    for f in range(P.shape[0]):
        if not lo and grab - 0.2 <= f / FPS <= release + 0.2:
            continue
        for s in ("Left", "Right"):
            x, y, z = P[f, I[s + "Hand"]]
            if half - t <= abs(x) <= half + t and 0.02 < y < rim and front - 0.6 < z < front + 0.05:
                n += 1
                break
    return n


def rank(tries: list[dict]) -> list[dict]:
    """Weighted-sum ranking over survivors; adds "rank" and plain-words "reason". Min-max normalised."""
    names = [n for n, key in METRIC_KEY.items() if any(key in t["metrics"] for t in tries)]
    if not tries:
        return tries
    if len(tries) == 1:
        tries[0]["rank"] = 1
        tries[0]["reason"] = REASONS.get(names[0], "cleanest try")
        return tries
    # a try missing a metric (e.g. no grip for gestures) scores worst on that check
    vals = {n: [t["metrics"].get(METRIC_KEY[n]) for t in tries] for n in names}
    for t in tries:
        t["_w"] = 0.0
    for n in names:
        present = [v for v in vals[n] if v is not None]
        lo = min(present) if present else 0.0
        hi = max(present) if present else 0.0
        for t, v in zip(tries, vals[n]):
            v = hi if v is None else v
            t["_w"] += WEIGHTS[n] * ((v - lo) / (hi - lo) if hi > lo else 0.0)
    order = sorted(tries, key=lambda t: t["_w"])
    for r, t in enumerate(order, 1):
        t["rank"] = r
        wins = [n for n in names if t["metrics"].get(METRIC_KEY[n]) is not None
                and t["metrics"][METRIC_KEY[n]] == min(v for v in vals[n] if v is not None)]
        t["reason"] = REASONS.get(wins[0], "cleanest try") if wins else "cleanest try"
    for t in tries:
        t.pop("_w", None)
    return tries


def dropped_reason(failed: list[str]) -> str:
    return DROPPED.get(failed[0], "the move didn't look right")
