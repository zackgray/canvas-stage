"""The tiny test GLB the piece tests load (committed; regenerate only if it must change):
  <LIFT_PYTHON> scripts/pieces/fixture.py  -> src/stage3d/__tests__/fixtures/piece-box.glb
A 2 x 1 x 0.5 box sitting off-centre (min corner at 1, 0.5, -0.25), so normalising, scaling and the extent reader all have work to do.
"""
import os

import trimesh

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'src', 'stage3d', '__tests__', 'fixtures', 'piece-box.glb')
os.makedirs(os.path.dirname(out), exist_ok=True)
box = trimesh.creation.box(extents=[2.0, 1.0, 0.5])
box.apply_translation([2.0, 1.0, 0.0])
box.export(out)
print(out, os.path.getsize(out), 'bytes')
