# Canvas Stage app

The web app and dev server for Canvas Stage: a Vite and React app with a three.js Stage, plus local server routes that run
the free steps (clay video, finish, export) and submit the paid Comfy graphs. The tabs are Home, Stage, Render and Export.
Setup, what is free and what is paid, the Comfy connection and licences are in the [root README](../README.md); the step-by-step
list is [SETUP.md](../SETUP.md); how the app talks to Comfy is in [docs/comfy-integration.md](../docs/comfy-integration.md).

Free tour (no key, no GPU), from the repo root:

```bash
cd app && npm ci && cd ..
node scripts/install-sample.mjs     # loads the sample scene into app/public/lab-assets
cd app && npm run dev               # http://localhost:5173
```

For the paid path: `cp .env.example .env`, fill it in, restart. Commands here: `npm run build` (typecheck and build),
`npm run lint`, `npx vitest run` (never loads your key, cannot bill).

Scene data lives in `public/lab-assets/` (git-ignored): `scene/<id>/` is a scene, `locations/<id>/` its world, registered in
`locations/manifest.json`.
