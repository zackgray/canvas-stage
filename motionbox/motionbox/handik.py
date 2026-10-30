"""--hand-ik for the CMU retarget (split out of the spike's tools/retarget_cmu.py).

CMU-35 has ~7 cm shorter forearms, 6 cm wider shoulders and is ~0.2 m shorter than SOMA, so a
pure direction retarget lowers and widens a two-handed grip. Re-aim both arms (two-bone IK,
elbow kept on its retargeted side, hand keeps its world rotation) so that the wrist midpoint sits
where the source's sits relative to the head (scaled by height), and the wrist-to-wrist vector is
the source's, unscaled (the held object has a real width).
"""
import numpy as np

from .retarget import UNIT, fk, min_rot, unit
from . import soma


def arm_ik(names, parents, off, ends, Lc, root, Ps):
    idx = {n: i for i, n in enumerate(names)}
    pos = fk(names, parents, off, ends, Lc, root)
    Pc, Gc = pos["joints"], pos["G"]
    S_ = soma.S77.idx
    cmu_head_h = (Pc[0, idx["Head"], 1] - pos["ends"][0, [idx["LeftToeBase"], idx["RightToeBase"]], 1].min()) * UNIT
    kb = cmu_head_h / (Ps[0, S_["Head"], 1] - Ps[0, :, 1].min())          # height ratio (both in metres)
    src_mid = (Ps[:, S_["LeftHand"]] + Ps[:, S_["RightHand"]]) / 2
    src_half = (Ps[:, S_["LeftHand"]] - Ps[:, S_["RightHand"]]) / 2 / UNIT  # absolute width, in CMU units
    mid = Pc[:, idx["Head"]] + kb * (src_mid - Ps[:, S_["Head"]]) / UNIT
    tgt = {"Left": mid + src_half, "Right": mid - src_half}
    L = Lc.copy()
    for side in ("Left", "Right"):
        a, b, c = idx[side + "Arm"], idx[side + "ForeArm"], idx[side + "Hand"]
        pa = parents[a]
        la, lb = np.linalg.norm(off[b]), np.linalg.norm(off[c])
        A, B = Pc[:, a], Pc[:, b]
        t = tgt[side] / 1.0
        d = np.clip(np.linalg.norm(t - A, axis=-1), 1e-4, (la + lb) * 0.999)
        axis = unit(t - A)
        pole = B - A; pole = pole - axis * (pole * axis).sum(-1, keepdims=True); pole = unit(pole)
        cos_a = np.clip((la ** 2 + d ** 2 - lb ** 2) / (2 * la * d), -1, 1)
        ang = np.arccos(cos_a)[:, None]
        Bn = A + la * (np.cos(ang) * axis + np.sin(ang) * pole)
        hand_world = Gc[:, c].copy()
        Ga = min_rot(np.einsum("tij,j->ti", Gc[:, a], off[b]), Bn - A) @ Gc[:, a]
        Gb = Ga @ L[:, b]
        Gb = min_rot(np.einsum("tij,j->ti", Gb, off[c]), t - Bn) @ Gb
        L[:, a] = np.einsum("tji,tjk->tik", Gc[:, pa], Ga)
        L[:, b] = np.einsum("tji,tjk->tik", Ga, Gb)
        L[:, c] = np.einsum("tji,tjk->tik", Gb, hand_world)
    return L
