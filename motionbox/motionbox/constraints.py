"""MoveSpec -> Kimodo wrist end-effector constraints, plus the base-pose bank (plan 2.3).

A spec key is {"frame", "hands": {"Left": [x,y,z], "Right": [x,y,z]}, "pose"}; each key's base pose
comes from the bank (reach-low / hold-chest / hold-high / stand, a few frames of real generated
output shipped under data/). A key may instead name a stored clip explicitly as
{"base": "c07", "base_t": 2.5}, resolved against the spike folder by the service.

Each key takes the base frame, re-centres its root over the origin, moves each wrist onto the
asked point with two-bone IK (hand keeps its world rotation), and emits left-hand / right-hand
constraints as SOMA-30 axis-angle local rotations + root positions, the format the Kimodo loader
expects (same algorithm and output shape as the spike's tools/make_constraints.py).

Coordinates: Y up, the figure starts at the origin facing +Z, left = +X, metres.
"""
import json
from pathlib import Path
import numpy as np

from . import soma

BANK_POSES = ("reach-low", "hold-chest", "hold-high", "stand")


def load_bank(data_dir) -> dict:
    """pose name -> {"local": (77,3,3) SOMA-77 local rots, "root": (3,), "clip", "t"}"""
    z = np.load(Path(data_dir) / "base_poses.npz")
    meta = json.load(open(Path(data_dir) / "base_poses.json"))
    return {p: {"local": z[p + "_local"], "root": z[p + "_root"], **meta[p]} for p in BANK_POSES}


class ClipResolver:
    """Resolve a stored clip name ("c07", "../candidates/c07.npz") to a loaded npz from the spike folder."""

    def __init__(self, spike_dir):
        self.dirs = [Path(spike_dir) / d for d in ("candidates", "chosen", "lower")]

    def load(self, name: str) -> dict:
        stem = Path(str(name)).stem
        for d in self.dirs:
            p = d / (stem + ".npz")
            if p.exists():
                return np.load(p)
        raise FileNotFoundError(f"stored clip {name!r} not found under {self.dirs[0].parent}")


def _base_frame(key: dict, bank: dict, resolver: ClipResolver | None):
    """(SOMA-77 local rots (77,3,3), root (3,)) for one key."""
    if key.get("base"):
        if resolver is None:
            raise ValueError("key names a stored clip but no clip resolver is configured")
        z = resolver.load(key["base"])
        f = int(round(key.get("base_t", 0.0) * 30))
        return z["local_rot_mats"][f], z["root_positions"][f].copy()
    pose = key.get("pose", "stand")
    if bank is None or pose not in bank:
        raise ValueError(f"unknown base pose {pose!r}; expected one of {BANK_POSES}")
    return bank[pose]["local"], bank[pose]["root"].copy()


def materialize(spec: dict, bank: dict | None = None, resolver: ClipResolver | None = None) -> tuple[list, list]:
    """spec -> (constraints JSON entries, report). Entry shapes match the spike's constraints files."""
    per_type, report = {}, []
    for k in spec["keys"]:
        local77, root = _base_frame(k, bank, resolver)
        loc = soma.local77_to_30(local77[None])[0]
        root = root.copy()
        root[[0, 2]] = k.get("root_xz", [0.0, 0.0])
        for side, tgt in k["hands"].items():
            loc = soma.two_bone_ik(soma.S30, loc, root, side, tgt, pole_hint=[(1 if side == "Left" else -1) * 0.6, -0.4, -0.3])
        P, _ = soma.S30.fk(loc[None], root[None])
        got = {s: P[0, soma.S30.idx[s + "Hand"]].round(3).tolist() for s in ("Left", "Right")}
        report.append({"frame": k["frame"], "asked": k["hands"], "got": got,
                       "grip_m": round(float(np.linalg.norm(P[0, soma.S30.idx["LeftHand"]] - P[0, soma.S30.idx["RightHand"]])), 3)})
        for t in ("left-hand", "right-hand"):
            e = per_type.setdefault(t, {"type": t, "frame_indices": [], "local_joints_rot": [], "root_positions": [], "smooth_root_2d": []})
            e["frame_indices"].append(int(k["frame"]))
            e["local_joints_rot"].append(soma.aa(loc).tolist())
            e["root_positions"].append(root.tolist())
            e["smooth_root_2d"].append([float(root[0]), float(root[2])])
    if "root2d" in spec:  # optional straight-line root path (carry), same shape as the spike's
        r = spec["root2d"]; fr = list(range(r["total"]))
        a = np.clip((np.array(fr) - r["f0"]) / (r["f1"] - r["f0"]), 0, 1)
        a = a * a * (3 - 2 * a)  # ease in/out
        xz = (1 - a)[:, None] * np.array(r["from"]) + a[:, None] * np.array(r["to"])
        per_type["root2d"] = {"type": "root2d", "frame_indices": fr, "smooth_root_2d": xz.round(4).tolist()}
    return list(per_type.values()), report
