// A paid face candidate is never made worthless by a free step (review R1), through the real routes (the L2R plugin's Fix / Finish,
// the passes plugin's Keep): Fix -> Grade switched -> Finish again -> Keep keeps it AND finishes it with the new switches; and two
// people fixed before either is kept are both keepable, the second pasted again onto the first's kept face. Fake Cloud and scripts.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { biblePaths, type BibleRecord } from '../../../src/shared/bibleContract.ts'
import type { PassCandidate } from '../../../src/shared/passContract.ts'
import { claimOf, resetClaims } from '../../jobs/inflight.ts'
import { call, JSON_LOCAL, post } from '../../project/__tests__/rig.ts'
import { labPasses } from '../../passes/plugin.ts'
import { resetRegistry } from '../../passes/registry.ts'
import { resetFinishing } from '../finish.ts'
import type { FacePerson } from '../facePeople.ts'
import { FACE_KEY } from '../faceSpec.ts'
import { bothInfo, faceJob, faceWorld, finishedRender, HERO, mountFace, type FaceWorld } from './faceRig.ts'
import { stampStills, TAKE, until, WORLD } from './rig.ts'

afterEach(() => { resetClaims(); resetFinishing(); resetRegistry() })
type H = Parameters<typeof call>[0]
const TOM: FacePerson = { ...HERO, subject: 'extra:0:0', name: 'Tom', cardId: 'tom', color: [0, 0, 255], description: 'A lean young man.' }

/** a Bible with a master (what Grade matches to), the face rig mounted, the passes routes beside it */
function rig(people: FacePerson[] = [HERO]) {
  const w = faceWorld()
  const b: BibleRecord = { worldId: WORLD, version: 2, prompt: '', master: { id: 'm1', png: '/lab-assets/locations/m.png', madeBy: 'qwen', seed: 1, depthStrength: 1, jobId: null, credits: 0, createdAt: 't' },
    candidates: [], lighting: '', materials: '', elements: [], extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't' }
  const bf = path.join(w.pub, ...biblePaths(WORLD).file.split('/'))
  mkdirSync(path.dirname(bf), { recursive: true }); writeFileSync(bf, JSON.stringify(b))
  writeFileSync(path.join(w.pub, 'lab-assets', 'locations', 'm.png'), 'png')
  stampStills(w, b.version)
  const m = mountFace(w, w.runtime({ fetchInfo: async () => bothInfo() }), async () => people)
  const routes: Record<string, H> = {}
  ;(labPasses().configureServer as (s: unknown) => void)({ config: { root: path.dirname(w.pub), publicDir: w.pub }, middlewares: { use: (p: string, h: H) => { routes[p] = h } } })
  const keep = (id: string) => post(routes['/__lab/passes'], '/keep', { id }, JSON_LOCAL)
  return { w, m, keep }
}
const candFile = (w: FaceWorld, id: string) => path.join(w.pub, 'lab-assets', 'shots', TAKE, 'passes', `${id}.json`)
/** landed, and the pass has let go of its section (the next Fix is not refused busy) */
const settled = async (w: FaceWorld, c: PassCandidate) => { await until(() => JSON.parse(readFileSync(candFile(w, c.id), 'utf8')).state !== 'running' && !claimOf(FACE_KEY)); return JSON.parse(readFileSync(candFile(w, c.id), 'utf8')) as PassCandidate }
const passDir = (w: FaceWorld, id: string, c: PassCandidate) => path.join(w.dirs.l2r, 'face', id, c.id)
const render = (w: FaceWorld, id: string) => JSON.parse(readFileSync(path.join(w.dirs.l2r, `${id}.json`), 'utf8'))

describe('Fix this face, then a free Finish again, then Keep', () => {
  it('Finish again while the pass runs: the candidate lands finished as the render is now, and Keep keeps it', async () => {
    const { w, m, keep } = rig()
    const id = await finishedRender(w, m)
    expect((await m.finish(id, { grade: false })).status).toBe(200) // the owner had the grade off
    let open!: () => void
    w.queue.push(faceJob('cccccccc-0000-4000-8000-0000000000b0', () => new Promise<void>((r) => { open = r })))
    const started = (await m.fix(id)).body.candidate as PassCandidate
    expect(started.state).toBe('running')
    expect((await m.finish(id, { grade: true })).status).toBe(200) // free, while the paid pass runs
    w.py.calls.length = 0
    open()
    const c = await settled(w, started)
    expect(c.state).toBe('candidate')
    expect(w.py.calls[0].slice(1).map((a) => path.basename(a))).toContain('after-raw.mp4')
    expect(path.basename(w.py.calls[0][1])).toBe('colormatch.py') // graded: the switch it had when it landed
    const k = await keep(c.id)
    expect([k.status, k.body.error]).toEqual([200, undefined])
    expect(render(w, id).finished).toBe(c.afterUrl)
  })
  it('Finish again between the candidate and Keep: Keep keeps it AND finishes it with the switches the render has now', async () => {
    const { w, m, keep } = rig()
    const id = await finishedRender(w, m)
    expect((await m.finish(id, { grade: false })).status).toBe(200)
    w.queue.push(faceJob('cccccccc-0000-4000-8000-0000000000b1'))
    const c = await settled(w, (await m.fix(id)).body.candidate)
    expect(c.state).toBe('candidate')
    expect((await m.finish(id, { grade: true })).status).toBe(200) // free, while the candidate waits
    const submits = w.jobs.submits
    w.py.calls.length = 0
    const k = await keep(c.id)
    expect([k.status, k.body.error]).toEqual([200, undefined])
    expect(k.body.candidate.state).toBe('kept')
    // the after was finished again from the pass's pasted raw, graded as the render is now; nothing was sent
    const first = w.py.calls[0].slice(1).map((a) => path.basename(a))
    expect(first[0]).toBe('colormatch.py')
    expect(first).toContain('after-raw.mp4')
    expect(w.jobs.submits).toBe(submits)
    expect(render(w, id).finished).toBe(c.afterUrl)
  })
  it('after an earlier kept face, Finish again moves the cut, and the next pass is still kept (was 409 target_changed)', async () => {
    const { w, m, keep } = rig()
    const id = await finishedRender(w, m)
    w.queue.push(faceJob('cccccccc-0000-4000-8000-0000000000b2'))
    const a = await settled(w, (await m.fix(id)).body.candidate)
    expect((await keep(a.id)).status).toBe(200)
    w.queue.push(faceJob('cccccccc-0000-4000-8000-0000000000b3'))
    const b = await settled(w, (await m.fix(id)).body.candidate)
    expect(b.beforeUrl).toBe(a.afterUrl)
    expect((await m.finish(id, { grade: true })).status).toBe(200) // the cut is the canonical file again, not a's after
    const k = await keep(b.id)
    expect([k.status, k.body.code]).toEqual([200, undefined])
    expect(render(w, id).finished).toBe(b.afterUrl)
  })
})

describe('two people fixed before either is kept', () => {
  it('Keep one, then Keep the other: the second is pasted again onto the first kept face, free, and both faces stay', async () => {
    const { w, m, keep } = rig([HERO, TOM])
    const id = await finishedRender(w, m)
    w.queue.push(faceJob('cccccccc-0000-4000-8000-0000000000c1'))
    const a = await settled(w, (await m.fix(id, 'hero')).body.candidate)
    w.queue.push(faceJob('cccccccc-0000-4000-8000-0000000000c2'))
    const fb = await m.fix(id, 'extra:0:0')
    expect([fb.status, fb.body.error]).toEqual([200, undefined])
    const b = await settled(w, fb.body.candidate)
    expect([a.state, b.state]).toEqual(['candidate', 'candidate'])
    const submits = w.jobs.submits
    expect((await keep(a.id)).status).toBe(200)
    w.face.calls.length = 0
    const k = await keep(b.id)
    expect([k.status, k.body.code]).toEqual([200, undefined])
    expect(w.jobs.submits).toBe(submits) // the paste is free: nothing resubmitted
    // b's window went onto a's kept picture, and b's pasted raw is the render's finish source now
    const paste = w.face.calls.find((c) => c[1] === 'paste')!
    expect(paste).toBeDefined()
    expect(readFileSync(path.join(passDir(w, id, b), 'source.mp4'), 'utf8')).toBe(readFileSync(path.join(passDir(w, id, a), 'after-raw.mp4'), 'utf8'))
    const state = JSON.parse(readFileSync(path.join(w.dirs.l2r, `${id}-face.json`), 'utf8'))
    expect(state.source).toBe(`face/${id}/${b.id}/after-raw.mp4`)
    expect(state.kept.map((x: { subject: string }) => x.subject)).toEqual(['hero', 'extra:0:0'])
    expect(render(w, id).finished).toBe(b.afterUrl)
  })
})
