// The face pass over the L2R rig (rig.ts): a finished render, one staged person (people stubbed: facePeople reads a kit world and
// the project's cards, tested on its own), the face scripts faked (they write what face_track.py / face_paste.py would), a fake
// Cloud job that returns the window render and the redrawn face. No network, no Python, no GPU.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Job } from '@comfyorg/sdk'
import { permissiveInfo } from '../../jobs/__tests__/rig.ts'
import { resetClaims } from '../../jobs/inflight.ts'
import type { JobRuntime } from '../../jobs/index.ts'
import { call, JSON_LOCAL } from '../../project/__tests__/rig.ts'
import { resetFinishing, type RunPython } from '../finish.ts'
import { facePassGraph } from '../facePassGraph.ts'
import type { FacePerson } from '../facePeople.ts'
import { l2rGraph } from '../graph.ts'
import { labL2R } from '../plugin.ts'
import { APP, FRAMES, STILL, TAKE, until, world, type World } from './rig.ts'

export const HERO: FacePerson = { subject: 'hero', name: 'Mara', headPx: 60, small: true, why: null, cardId: 'mara', faceFile: process.execPath, color: [255, 0, 0], description: 'A woman of thirty in a denim jacket. She has short hair.' }

export const faceJob = (id: string, wait: () => Promise<void> = async () => {}): Job => ({
  id, status: 'succeeded', metrics: { execution_ms: 30000 }, wait,
  getOutputs: (node: string) => node === 'save_t' ? [{ name: 'out.mp4', toFile: async (p: string) => writeFileSync(p, `window of ${id}`) }]
    : node === 'fout' ? [{ name: 'out.png', toFile: async (p: string) => writeFileSync(p, 'face') }] : [],
}) as unknown as Job

export interface FaceWorld extends World { face: { calls: string[][]; fail: Record<string, string>; track: { ok: boolean; why?: string } } }

export function faceWorld(cap?: number): FaceWorld {
  const w = world({ cap, clay: { idPass: { frames: [0, 24, 48], pattern: 'id_%03d.png', colors: { hero: [255, 0, 0] } }, depth: { kind: 'planar', unitM: 0.01, frames: FRAMES, width: 1920, height: 1088, pattern: 'zdepth_%03d.png' } } })
  const face = { calls: [] as string[][], fail: {} as Record<string, string>, track: { ok: true } as { ok: boolean; why?: string } }
  const base = w.run
  const run: RunPython = async (python, args) => {
    const script = path.basename(args[0])
    if (script !== 'face_track.py' && script !== 'face_paste.py') return base(python, args)
    const cmd = args[1], plan = JSON.parse(readFileSync(args[2], 'utf8'))
    face.calls.push([script, cmd, args[2]])
    if (face.fail[cmd]) throw new Error(face.fail[cmd])
    const put = (dir: string, n: string, v = 'x') => writeFileSync(path.join(dir, n), v)
    if (cmd === 'track') {
      put(plan.out, 'track.json', JSON.stringify({ summary: { ...face.track, frames: FRAMES, hits: face.track.ok ? FRAMES : 10, ...(face.track.ok ? { strip: [0, 24, 40, 48] } : {}) }, source: plan.sourceKey, rows: [] }))
      if (face.track.ok) put(plan.out, 'strip.png')
    } else if (cmd === 'window') {
      for (const n of ['win-raw.mp4', 'still-win.png', 'face-mask-win.png']) put(plan.out, n)
      put(plan.out, 'window.json', JSON.stringify({ win: 200, out: 1088, faceY: 0.4, boxes: [[860.4, 300.6]] }))
    } else if (cmd === 'paste') writeFileSync(plan.afterRaw, `pasted ${plan.raw}`)
    else if (cmd === 'crops') { writeFileSync(plan.beforeCrop, 'b'); writeFileSync(plan.afterCrop, 'a') }
  }
  return Object.assign(w, { run, face })
}

/** permissive object_info for both the render and the face pass graphs */
export const bothInfo = () => {
  const g = facePassGraph({ prompt: 'p', facePrompt: 'f', seed: 1, kleinSeed: 2, frames: 9, prefix: 'x' })
  // a class both graphs use with different inputs (CLIPLoader: the LTX one sets `device`, Klein's leaves it to its default) takes
  // the inputs every use sets as required and the rest as optional, as Cloud's object_info lists them
  const a = permissiveInfo(l2rGraph({ prompt: 'p', seed: 1, frames: 9, prefix: 'x', layoutSize: { w: 1280, h: 720 } })) as unknown as Record<string, { input: { required: Record<string, unknown>; optional?: Record<string, unknown> } }>
  const b = permissiveInfo(g) as unknown as typeof a
  const out = { ...a, ...b }
  for (const k of Object.keys(a)) if (b[k]) {
    const ra = a[k].input.required, rb = b[k].input.required
    const req = Object.fromEntries(Object.keys(ra).filter((x) => x in rb).map((x) => [x, ra[x]]))
    const opt = Object.fromEntries([...Object.keys(ra), ...Object.keys(rb)].filter((x) => !(x in req)).map((x) => [x, ['*']]))
    out[k] = { ...b[k], input: { required: req, optional: opt } }
  }
  return out as unknown as ReturnType<typeof permissiveInfo>
}

type Handler = Parameters<typeof call>[0]
export function mountFace(w: FaceWorld, rt: JobRuntime, people: () => Promise<FacePerson[]> = async () => [HERO]) {
  resetClaims(); resetFinishing()
  const routes: Record<string, Handler> = {}
  const p = labL2R({ LIFT_PYTHON: process.execPath, COMFY_BASE_URL: 'http://fake-comfy.invalid' },
    { deps: w.deps(rt), finish: { run: w.run }, face: { people, yunet: process.execPath, jobPollMs: 2, answerMs: 2000 } })
  ;(p.configureServer as (s: unknown) => void)({ config: { root: APP, publicDir: w.pub, mode: 'test', envDir: APP }, middlewares: { use: (pre: string, h: Handler) => { routes[pre] = h } } })
  const h = routes['/__lab/l2r']
  const post = (url: string, b: unknown) => call(h, url, { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify(b) })
  return {
    render: () => post('/', { takeId: TAKE, stillId: STILL }),
    finish: (renderId: string, extra: object = {}) => post('/finish', { renderId, ...extra }),
    status: (renderId: string) => call(h, `/face?render=${renderId}`),
    track: (renderId: string, subject = 'hero') => post('/face/track', { renderId, subject }),
    fix: (renderId: string, subject = 'hero') => post('/face', { renderId, subject }),
  }
}

/** a finished render to work on (the automatic finish has landed) */
export async function finishedRender(w: FaceWorld, m: ReturnType<typeof mountFace>): Promise<string> {
  const r = await m.render()
  if (!r.body.render) throw new Error(`the render was refused: ${JSON.stringify(r.body)}`)
  const id = r.body.render.id as string
  const json = () => JSON.parse(readFileSync(path.join(w.dirs.l2r, `${id}.json`), 'utf8'))
  await until(() => !!json().finished)
  w.py.calls.length = 0
  return id
}
