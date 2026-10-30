"""Retarget a Kimodo SOMA-77 clip (posed_joints, global_rot_mats) onto the CMU subject-35 BVH skeleton.

Adapted from the spike's tools/retarget_cmu.py (split: this file + handik.py). Output matches the
app's CMU clip files: 35_01's HIERARCHY verbatim, CMU units (0.0564 m/unit), 120 fps, the floor at
y = 0. Method: per CMU joint, direction retarget with twist from the SOMA driver joint, then a
minimal-rotation residual so each bone lies exactly along the source span; root is the SOMA hips
scaled by the leg-length ratio. --hand-ik (handik.arm_ik) restores the source's grip height and
absolute grip width, which CMU's shorter forearms otherwise lower and widen.
"""
import argparse
import numpy as np
from scipy.spatial.transform import Rotation as R, Slerp

from . import soma

UNIT = 0.0564
S = soma.S77.idx

# CMU joint -> (SOMA driver joint, SOMA span the CMU bone should lie along, CMU child whose offset is the bone)
MAP = {
    "Hips": ("Hips", None, None),
    "LHipJoint": ("Hips", ("Hips", "LeftLeg"), "LeftUpLeg"),
    "LeftUpLeg": ("LeftLeg", ("LeftLeg", "LeftShin"), "LeftLeg"),
    "LeftLeg": ("LeftShin", ("LeftShin", "LeftFoot"), "LeftFoot"),
    "LeftFoot": ("LeftFoot", ("LeftFoot", "LeftToeBase"), "LeftToeBase"),
    "LeftToeBase": ("LeftToeBase", ("LeftToeBase", "LeftToeEnd"), "@end"),
    "RHipJoint": ("Hips", ("Hips", "RightLeg"), "RightUpLeg"),
    "RightUpLeg": ("RightLeg", ("RightLeg", "RightShin"), "RightLeg"),
    "RightLeg": ("RightShin", ("RightShin", "RightFoot"), "RightFoot"),
    "RightFoot": ("RightFoot", ("RightFoot", "RightToeBase"), "RightToeBase"),
    "RightToeBase": ("RightToeBase", ("RightToeBase", "RightToeEnd"), "@end"),
    "LowerBack": ("Spine1", ("Hips", "Spine2"), "Spine"),
    "Spine": ("Spine2", ("Spine2", "Neck1"), "Spine1"),
    "Spine1": ("Chest", None, None),
    "Neck": ("Neck1", ("Neck1", "Neck2"), "Neck1"),
    "Neck1": ("Neck2", ("Neck2", "Head"), "Head"),
    "Head": ("Head", ("Head", "HeadEnd"), "@end"),
    "LeftShoulder": ("LeftShoulder", ("LeftShoulder", "LeftArm"), "LeftArm"),
    "LeftArm": ("LeftArm", ("LeftArm", "LeftForeArm"), "LeftForeArm"),
    "LeftForeArm": ("LeftForeArm", ("LeftForeArm", "LeftHand"), "LeftHand"),
    "LeftHand": ("LeftHand", ("LeftHand", "LeftHandMiddle1"), "@x+"),
    "LeftFingerBase": ("LeftHandMiddle1", None, None),
    "LeftHandIndex1": ("LeftHandIndex2", None, None),
    "LThumb": ("LeftHandThumb1", None, None),
    "RightShoulder": ("RightShoulder", ("RightShoulder", "RightArm"), "RightArm"),
    "RightArm": ("RightArm", ("RightArm", "RightForeArm"), "RightForeArm"),
    "RightForeArm": ("RightForeArm", ("RightForeArm", "RightHand"), "RightHand"),
    "RightHand": ("RightHand", ("RightHand", "RightHandMiddle1"), "@x-"),
    "RightFingerBase": ("RightHandMiddle1", None, None),
    "RightHandIndex1": ("RightHandIndex2", None, None),
    "RThumb": ("RightHandThumb1", None, None),
}


def read_header(path):
    """35_01's HIERARCHY text plus joint names / parents / offsets (units) / End Site offsets, in file order."""
    text = open(path).read()
    hier = text[: text.index("MOTION")]
    names, parents, offsets, ends, stack = [], [], [], {}, []
    tok = hier.split()
    i = 0; last = None; in_end = False
    while i < len(tok):
        t = tok[i]
        if t in ("ROOT", "JOINT"):
            names.append(tok[i + 1]); parents.append(stack[-1] if stack else -1); last = len(names) - 1; i += 2; continue
        if t == "End":
            in_end = True; i += 2; continue
        if t == "{":
            stack.append(last) if not in_end else None
        elif t == "}":
            if in_end: in_end = False
            else: stack.pop()
        elif t == "OFFSET":
            v = np.array([float(x) for x in tok[i + 1: i + 4]])
            if in_end: ends[stack[-1]] = v
            else: offsets.append(v)
            i += 4; continue
        i += 1
    return hier, names, parents, np.array(offsets), ends


def unit(v):
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


def min_rot(a, b):
    """batched minimal rotation matrices taking unit vectors a -> b (T,3)"""
    a, b = unit(a), unit(b)
    v = np.cross(a, b); c = (a * b).sum(-1); s = np.linalg.norm(v, axis=-1)
    ang = np.arctan2(s, c)
    axis = np.where(s[:, None] > 1e-9, v / np.maximum(s, 1e-12)[:, None], np.array([1.0, 0, 0]))
    return R.from_rotvec(axis * ang[:, None]).as_matrix()


def retarget(P, G, hdr_path, fps_out=120, hold_tail=0.0, hand_ik=False):
    hier, names, parents, off, ends = read_header(hdr_path)
    J = len(names); T = P.shape[0]; idx = {n: i for i, n in enumerate(names)}
    rest_S = soma.S77.neutral  # SOMA rest (identity rotations) joint positions
    Gc = np.zeros((T, J, 3, 3))
    for j, n in enumerate(names):
        drv, span, child = MAP[n]
        Gd = G[:, S[drv]]
        if span is None:
            Gc[:, j] = Gd; continue
        if child == "@end": bone = ends[j]
        elif child == "@x+": bone = np.array([1.0, 0, 0])
        elif child == "@x-": bone = np.array([-1.0, 0, 0])
        else: bone = off[idx[child]]
        rest_span = rest_S[S[span[1]]] - rest_S[S[span[0]]]
        A = min_rot(bone[None], rest_span[None])[0]          # CMU rest bone -> SOMA rest span
        G0 = Gd @ A                                           # driver rotation applied to the corrected rest
        tgt = P[:, S[span[1]]] - P[:, S[span[0]]]
        cur = np.einsum("tij,j->ti", G0, bone)
        Gc[:, j] = min_rot(cur, tgt) @ G0                     # lay the bone exactly along the source span
    Lc = np.zeros_like(Gc)
    for j in range(J):
        p = parents[j]
        Lc[:, j] = Gc[:, j] if p < 0 else np.einsum("tji,tjk->tik", Gc[:, p], Gc[:, j])
    # root: leg-length ratio, floor at y=0
    cmu_leg = (np.linalg.norm(off[idx["LeftLeg"]]) + np.linalg.norm(off[idx["LeftFoot"]])) * UNIT
    som_leg = np.linalg.norm(rest_S[S["LeftShin"]] - rest_S[S["LeftLeg"]]) + np.linalg.norm(rest_S[S["LeftFoot"]] - rest_S[S["LeftShin"]])
    k = cmu_leg / som_leg
    root = P[:, S["Hips"]] * k / UNIT
    pos = fk(names, parents, off, ends, Lc, root)
    toe_y = pos["ends"][:, [idx["LeftToeBase"], idx["RightToeBase"]], 1].min()
    root[:, 1] -= toe_y
    if hand_ik:
        from .handik import arm_ik
        Lc = arm_ik(names, parents, off, ends, Lc, root, P)
    # resample to fps_out
    t_in = np.arange(T) / 30.0
    if hold_tail > 0:
        nt = int(round(hold_tail * 30))
        Lc = np.concatenate([Lc, np.repeat(Lc[-1:], nt, 0)]); root = np.concatenate([root, np.repeat(root[-1:], nt, 0)])
        t_in = np.arange(Lc.shape[0]) / 30.0
    t_out = np.arange(0, t_in[-1] + 1e-9, 1.0 / fps_out)
    eul = np.zeros((len(t_out), J, 3))
    for j in range(J):
        sl = Slerp(t_in, R.from_matrix(Lc[:, j]))
        eul[:, j] = sl(t_out).as_euler("ZYX", degrees=True)
    root_o = np.stack([np.interp(t_out, t_in, root[:, a]) for a in range(3)], -1)
    return hier, names, eul, root_o, fps_out, k


def fk(names, parents, off, ends, L, root):
    T, J = L.shape[:2]
    G = np.zeros_like(L); P = np.zeros((T, J, 3)); E = np.zeros((T, J, 3))
    for j in range(J):
        p = parents[j]
        if p < 0:
            G[:, j] = L[:, j]; P[:, j] = root + off[j]
        else:
            G[:, j] = G[:, p] @ L[:, j]; P[:, j] = P[:, p] + np.einsum("tij,j->ti", G[:, p], off[j])
        if j in ends:
            E[:, j] = P[:, j] + np.einsum("tij,j->ti", G[:, j], ends[j])
    return {"joints": P, "ends": E, "G": G}


def write_bvh(path, hier, eul, root, fps):
    lines = [hier.rstrip() + "\n", "MOTION\n", f"Frames: {len(eul)}\n", f"Frame Time: {1.0 / fps:.7f}\n"]
    for f in range(len(eul)):
        vals = list(root[f])
        for j in range(eul.shape[1]):
            vals += list(eul[f, j])
        lines.append(" ".join(f"{v:.4f}" for v in vals) + "\n")
    open(path, "w", newline="\n").writelines(lines)


def retarget_npz(npz_path, hdr_path, out_path, fps=120, hold_tail=0.0, hand_ik=False):
    z = np.load(npz_path, allow_pickle=False)
    hier, names, eul, root, fps, k = retarget(z["posed_joints"], z["global_rot_mats"], hdr_path, fps, hold_tail, hand_ik)
    write_bvh(out_path, hier, eul, root, fps)
    return {"frames": len(eul), "fps": fps, "joints": len(names), "leg_ratio": round(float(k), 3)}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("npz"); ap.add_argument("hdr"); ap.add_argument("out")
    ap.add_argument("--fps", type=int, default=120); ap.add_argument("--hold-tail", type=float, default=0.0)
    ap.add_argument("--hand-ik", action="store_true", help="keep the source's grip height (head-relative) and absolute grip width")
    a = ap.parse_args()
    info = retarget_npz(a.npz, a.hdr, a.out, a.fps, a.hold_tail, a.hand_ik)
    print(f"wrote {a.out}: {info['frames']} frames @ {info['fps']} fps, {info['joints']} joints, leg ratio {info['leg_ratio']:.3f}")
