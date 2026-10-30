# Stage car (`car-a.bin` / `car-a.json`)

The car the moving world puts on the set's street. Committed so a fresh clone gets the car, not the placeholder box.

- **Size:** 32,018 vertices, 77,540 triangles, 2.1 MB. Float32 positions, normals (baked), linear vertex colours,
  Uint32 indices; `car-a.json` holds the byte layout and what was done.
- **Frame:** metres, +Y up, length along X with the front at +X, tyre contacts at y = 0, X/Z centred; 4.5 x 1.46 x 2.0 m.

## Provenance

Every step is this project's own generation or processing; no third-party model file, scan or purchased asset is in it.

1. `car.png`: a generic red coupe, generated with Z-Image Turbo on Comfy Cloud (E9, `app/experiments/e9-car.md`,
   seed 90017). Z-Image still drew a small generic nose emblem; it is not a real brand, and at this decimation it is
   a few vertex colours.
2. `car.triposplat-mesh.glb`: TripoSplat (MIT) image-to-splat, then SplatToMesh, on Comfy Cloud
   (`workflows/e9_car-to-3d.api.json`). 1.39 M vertices, 2.86 M triangles, 67 MB.
3. `experiments/e24/car-a`: `app/experiments/e24_car.ts` levels the body (pitch -4.19°), scales it to 4.5 m long and
   2.0 m wide, and puts the tyre contacts on y = 0.
4. This file: `app/scripts/decimate-car.ts` (meshoptimizer's quadric simplifier, MIT, a dev dependency), 80k
   triangle target with vertex colour as a weighted attribute; geometric error about 1.4 cm.

The model licences are listed in the repo README ("Models and licences"); Z-Image Turbo is marked "verify" there.

## Regenerate

Needs steps 1–3 on disk (gitignored under `public/lab-assets/experiments/`), then from `app/`:

```bash
npx tsx experiments/e24_car.ts       # e9 GLB -> e24/car-a (levelled, scaled)
npx tsx scripts/decimate-car.ts      # e24/car-a -> public/assets/car/car-a (this asset)
```

The app loads this asset; it falls back to `/lab-assets/experiments/e24/car-a` only if this one is missing.
