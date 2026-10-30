"""CMU BVH reader with the app's semantics (adapted from the spike's tools/check_bvh.py):
rotation = product of the per-channel axis rotations in channel order, positions x 0.0564 m,
FK down the hierarchy. Used by the strip renderer and the tests' tolerance checks.
"""
import numpy as np
from scipy.spatial.transform import Rotation as R

UNIT = 0.0564
AX = {"X": np.array([1.0, 0, 0]), "Y": np.array([0, 1.0, 0]), "Z": np.array([0, 0, 1.0])}


def parse(path):
    tok = open(path).read().split(); i = 0
    joints = []

    def nxt():
        nonlocal i; i += 1; return tok[i - 1]

    assert nxt() == "HIERARCHY"

    def read(parent):
        name = nxt(); idx = len(joints); assert nxt() == "{"
        j = {"name": name, "parent": parent, "offset": np.zeros(3), "channels": [], "end": None}; joints.append(j)
        while True:
            t = nxt()
            if t == "OFFSET": j["offset"] = np.array([float(nxt()), float(nxt()), float(nxt())]) * UNIT
            elif t == "CHANNELS": j["channels"] = [nxt() for _ in range(int(nxt()))]
            elif t == "JOINT": read(idx)
            elif t == "End":
                nxt(); assert nxt() == "{"; assert nxt() == "OFFSET"
                j["end"] = np.array([float(nxt()), float(nxt()), float(nxt())]) * UNIT; assert nxt() == "}"
            elif t == "}": return
            else: raise ValueError(t)

    assert nxt() == "ROOT"; read(-1)
    assert nxt() == "MOTION"; assert nxt() == "Frames:"; F = int(nxt()); nxt(); nxt(); ft = float(nxt())
    data = np.array(tok[i:i + F * sum(len(j["channels"]) for j in joints)], float).reshape(F, -1)
    J = len(joints); Q = np.zeros((F, J, 3, 3)); root = np.zeros((F, 3)); c = 0
    for j, jt in enumerate(joints):
        M = np.tile(np.eye(3), (F, 1, 1))
        for ch in jt["channels"]:
            v = data[:, c]; c += 1
            if ch.endswith("position"): root[:, "XYZ".index(ch[0])] = v * UNIT
            else: M = M @ R.from_rotvec(AX[ch[0]][None] * np.radians(v)[:, None]).as_matrix()
        Q[:, j] = M
    return joints, Q, root, ft


def fk(joints, Q, root):
    F, J = Q.shape[:2]; G = np.zeros_like(Q); P = np.zeros((F, J, 3)); E = {}
    for j, jt in enumerate(joints):
        p = jt["parent"]
        if p < 0: G[:, j] = Q[:, j]; P[:, j] = root + jt["offset"]
        else: G[:, j] = G[:, p] @ Q[:, j]; P[:, j] = P[:, p] + np.einsum("fij,j->fi", G[:, p], jt["offset"])
        if jt["end"] is not None: E[jt["name"]] = P[:, j] + np.einsum("fij,j->fi", G[:, j], jt["end"])
    return P, G, E


def load(path):
    """parse + FK -> {"joints", "P", "E", "n", "ft", "frames", "floor"}"""
    joints, Q, root, ft = parse(path)
    P, G, E = fk(joints, Q, root)
    n = {jt["name"]: i for i, jt in enumerate(joints)}
    floor = min(E["LeftToeBase"][:, 1].min(), E["RightToeBase"][:, 1].min())
    return {"joints": joints, "P": P, "E": E, "n": n, "ft": ft, "frames": len(Q), "floor": floor}


def close_to(a: dict, b: dict, atol=2e-3):
    """True when two parsed BVHs share joint names/order and every joint stays within atol metres."""
    if [j["name"] for j in a["joints"]] != [j["name"] for j in b["joints"]]:
        return False
    F = min(a["frames"], b["frames"])
    return bool(np.allclose(a["P"][:F], b["P"][:F], atol=atol))
