# Splats (E10 spike)

Display-only Gaussian-splat version of a projector: one flat splat per (strided) pixel, no optimisation, drawn by
Spark next to the meshes. Answers "do splats hold off-angle better than the mesh?" by eye. Exports stay mesh-based.

- `fromDepth.ts` — pure converter. Centres on the grid's lattice and rays (planar depth), so splat = mesh vertex.
  Sigma = stride·d / (√2·f·cos θ) on the tilt axis (capped by `maxStretch`), stride·d / (√2·f) across, thin along
  the normal (from the depth gradient). Drops a ring at depth edges using the grid's own rule (`edges.ts`;
  `edgeRing`: both / far / off). Opacity is LINEAR [0, 1], Spark's in-memory convention; `.ply` wants the logit
  (`toPlyOpacity`) — WorldGen's bug was writing linear into a .ply.
- `SplatLayer.ts` — wraps Spark; one shared `SparkRenderer` per WebGLRenderer, added to the scene the first layer
  joins and removed with the last; hidden when no layer is visible.
- Sources: Spark `@sparkjsdev/spark` 2.3.1 (MIT, World Labs). Formulas only from WonderWorld (paper) and WorldGen
  (Apache-2.0, idea of the edge ring); no code lifted.

Wiring contract:
- `SplatLayer.fromSource(stage.renderer, stage.source, stage.projector, opts)` / `SplatLayer.fromSettled(renderer,
  projectorLayer, sharpen, opts)` / `new SplatLayer(renderer, input: SplatInput)`.
- `layer.object` → `stage.scene.add(...)`; `layer.setVisible(on)`; `layer.count`, `layer.bytes`, `layer.dropped`;
  `layer.dispose()`. Pass the grid's `{ edgeThreshold: edge, planeAware }` in opts so the cut matches the mesh.
- Rebuild when the source, lens, edge settings or stride change (it is a snapshot). Hide around captures/exports.

Known limits: no refine pass (seams, floaters, soft look). Settled patches are not pushed back like the mesh's
PUSH_BACK, so seams blend instead of the original winning. `packed: true` halves memory but stores centres as
half floats (~1.5 cm steps at 16-32 m). Memory: ~32 B/splat (ext) or 16 B (packed) CPU + the same on GPU, plus
Spark's per-frame accumulator; 1344×768 ≈ 1.03 M splats ≈ 33 MB ext at stride 1, ≈ 8.3 MB at stride 2.
Spark adds ~2.6 MB (minified, wasm inlined) to whatever chunk imports it — import it lazily.
