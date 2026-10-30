"""A generated set piece's massing clay (E139 massing(), free, ~3 s): the precise TRELLIS.2 mesh reduced to its big forms.
Voxelised at a pitch in metres at its placed size, dilated (keeps thin plates and posts), holes filled, the occupancy blurred
(drops rivets, finials and scrollwork; rounds edges like a bevel) and re-meshed by marching cubes, faces wound outward, kept in
the source mesh's frame and size so the world places both meshes the same way.
  <LIFT_PYTHON> scripts/pieces/massing.py --in mesh.glb --out massing.glb --size 8.5 --pitch 0.12 [--dilate 1]
Prints one JSON line of stats; exit 0 = written. Needs trimesh, scipy and scikit-image (your venv has them).
"""
import argparse, json, sys

import numpy as np

MAX_CELLS = 360  # per axis: a slim pitch on a big piece is coarsened to this rather than eat the machine


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='src', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--size', type=float, required=True, help='the placed largest side, metres')
    ap.add_argument('--pitch', type=float, required=True, help='voxel pitch, metres')
    ap.add_argument('--dilate', type=int, default=0)
    ap.add_argument('--sigma', type=float, default=1.0)
    a = ap.parse_args()
    import trimesh
    from scipy import ndimage
    from skimage import measure

    m = trimesh.load(a.src, force='scene').to_geometry()
    ext = float(max(m.extents))
    if not ext > 0:
        sys.exit('the mesh is empty')
    pitch = max(a.pitch / (a.size / ext), ext / MAX_CELLS)  # metres -> mesh units
    vg = m.voxelized(pitch)
    occ = np.pad(vg.matrix, 4)
    if a.dilate:
        occ = ndimage.binary_dilation(occ, iterations=a.dilate)
    occ = ndimage.binary_fill_holes(occ)
    occ = ndimage.gaussian_filter(occ.astype(np.float32), a.sigma)
    verts, faces, _, _ = measure.marching_cubes(occ, 0.5)
    verts = trimesh.transform_points(verts - 4, vg.transform)  # voxel index (pad 4) -> the source frame
    out = trimesh.Trimesh(verts, faces, process=True)
    if out.volume < 0:
        out.invert()  # skimage winds the faces inward here; three.js culls back faces
    # keep the source's size, centre and base (the world offsets both meshes by the precise one's box)
    c = out.bounds.mean(axis=0)
    out.apply_translation(-c)
    out.apply_scale(ext / max(out.extents))
    sc, sb = m.bounds.mean(axis=0), m.bounds[0][1]
    out.apply_translation([sc[0], 0, sc[2]])
    out.apply_translation([0, sb - out.bounds[0][1], 0])
    out.export(a.out)
    print(json.dumps({'srcFaces': int(len(m.faces)), 'faces': int(len(out.faces)), 'pitchUnits': round(pitch, 5),
                      'extent': np.round(out.extents, 4).tolist()}))


if __name__ == '__main__':
    main()
