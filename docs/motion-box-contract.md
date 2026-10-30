# Motion box contract (service <-> app plugin)

Loopback HTTP, JSON, `Authorization: Bearer <MOTION_BOX_TOKEN>` on every call (the box refuses without it). One GPU job at a
time, a queue of 1.

| call | request | response |
|---|---|---|
| `GET /health` | none | `{state: warming/ready/busy, gpu: {name, freeMiB}, encoder: cpu, version, secondsPerTry?}` in under 100 ms |
| `POST /jobs` | `{spec: MoveSpec, n: number (default 8), seeds?: number[]}` | `201 {id}` at once; `409 {error: busy}` if one runs and one is queued; `422 {error, message}` for a bad spec |
| `GET /jobs/:id` | none | `{id, stage: encoding/generating/scoring/retargeting/done/failed/cancelled, done, of, round (1 or 2), tries: Try[], dropped: {count, reason}, message?}` |
| `POST /jobs/:id/cancel` | none | `200 {stage}`; stops after the current try |
| `GET /jobs/:id/files/<try>.bvh`, `.png`, `.json` | none | the retargeted CMU-35 BVH (120 fps, 35_01 header, hand-IK), the stick-figure strip, the try's scores and timing |

`Try = {id, seed, rank, reason (plain words, e.g. "steadiest hands"), scores: {...}, seconds}`. Only the top 3 survivors are
retargeted and listed; rejected tries never leave the box unless asked for. Job folders live on the box for 24 h then are
deleted by age. `MoveSpec` is the shape in `app/src/stage3d/moves/types.ts`: the box only turns the spec's hand targets into constraints; it contains no product logic.
