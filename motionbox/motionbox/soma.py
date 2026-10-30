"""SOMA skeleton helpers (adapted from the spike's tools/soma.py): FK, 77->30 mapping, two-bone arm IK."""
import json
from pathlib import Path
import numpy as np
from scipy.spatial.transform import Rotation as R

_SK = json.load(open(Path(__file__).resolve().parent.parent / "data" / "skel.json"))


class Skel:
    def __init__(self, key):
        d = _SK[key]
        self.names = d["names"]; self.parents = d["parents"]; self.idx = {n: i for i, n in enumerate(self.names)}
        nj = np.array(d["neutral_joints"])
        self.neutral = nj
        self.offsets = np.array([nj[j] - (nj[p] if p >= 0 else 0) for j, p in enumerate(self.parents)])
        if self.parents[0] < 0:
            self.offsets[0] = 0  # root offset handled by root_positions

    def fk(self, local, root):
        """local (T,J,3,3), root (T,3) -> positions (T,J,3), global rots (T,J,3,3)"""
        T, J = local.shape[:2]
        G = np.zeros_like(local); P = np.zeros((T, J, 3))
        for j, p in enumerate(self.parents):
            if p < 0:
                G[:, j] = local[:, j]; P[:, j] = root
            else:
                G[:, j] = G[:, p] @ local[:, j]
                P[:, j] = P[:, p] + np.einsum("tij,j->ti", G[:, p], self.offsets[j])
        return P, G


S30 = Skel("SOMASkeleton30")
S77 = Skel("SOMASkeleton77")


def local77_to_30(local77):
    """pick the 30-joint subset's local rotations by name (hand/finger ends get identity)"""
    T = local77.shape[0]
    out = np.tile(np.eye(3), (T, 30, 1, 1))
    for j, n in enumerate(S30.names):
        if n in S77.idx and not n.endswith("End"):
            out[:, j] = local77[:, S77.idx[n]]
    return out


def two_bone_ik(sk, local, root, side, target, pole_hint=None):
    """Adjust one frame's arm (local (J,3,3), root (3,)) so <side>Hand reaches target; keeps the hand's world rotation.
    side: 'Left'/'Right'. Returns new local (J,3,3)."""
    local = local.copy()
    a, b, c = sk.idx[side + "Arm"], sk.idx[side + "ForeArm"], sk.idx[side + "Hand"]
    P, G = sk.fk(local[None], root[None]); P, G = P[0], G[0]
    hand_world = G[c].copy()
    la = np.linalg.norm(sk.offsets[b]); lb = np.linalg.norm(sk.offsets[c])
    A, B, C = P[a], P[b], P[c]
    t = np.asarray(target, float)
    d = np.clip(np.linalg.norm(t - A), 1e-4, (la + lb) * 0.999)
    # bend plane: keep the current elbow side unless a pole hint is given
    pole = (B - A) if pole_hint is None else np.asarray(pole_hint, float)
    axis = (t - A) / np.linalg.norm(t - A)
    pole_perp = pole - axis * np.dot(pole, axis)
    if np.linalg.norm(pole_perp) < 1e-6:
        pole_perp = np.cross(axis, [0, 1, 0])
    pole_perp /= np.linalg.norm(pole_perp)
    cos_a = (la ** 2 + d ** 2 - lb ** 2) / (2 * la * d)
    ang = np.arccos(np.clip(cos_a, -1, 1))
    B_new = A + la * (np.cos(ang) * axis + np.sin(ang) * pole_perp)

    def align(Gparent_child, cur_dir, new_dir):
        r, _ = R.align_vectors([new_dir], [cur_dir])
        return r.as_matrix() @ Gparent_child

    Ga_new = align(G[a], B - A, B_new - A)
    local[a] = G[sk.parents[a]].T @ Ga_new
    # recompute forearm global with new upper arm, then aim forearm at target
    Gb = Ga_new @ local[b]
    cur = Gb @ sk.offsets[c]
    Gb_new = align(Gb, cur, t - B_new)
    local[b] = Ga_new.T @ Gb_new
    # keep the hand's world rotation
    local[c] = Gb_new.T @ hand_world
    return local


def aa(mats):
    return R.from_matrix(mats.reshape(-1, 3, 3)).as_rotvec().reshape(mats.shape[:-2] + (3,))
