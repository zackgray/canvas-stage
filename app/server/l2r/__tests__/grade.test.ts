// Track C: the optional grade to the Bible's master. Finish order grade -> sharpen -> grain; colormatch.py blends the match
// in at the strength itself (default 0.7); recorded on the render; refused (free) with no master; a render without it finishes as before.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { biblePaths, type BibleRecord } from '../../../src/shared/bibleContract.ts'
import { resetClaims } from '../../jobs/inflight.ts'
import { resetFinishing } from '../finish.ts'
import { FRAMES, mount, stampStills, until, WORLD, world, type World } from './rig.ts'

afterEach(() => { resetClaims(); resetFinishing() })

function withMaster(w: World, o: Partial<BibleRecord> = {}) {
  const b: BibleRecord = { worldId: WORLD, version: 2, prompt: '', master: { id: 'm1', png: '/lab-assets/locations/m.png', madeBy: 'qwen', seed: 1, depthStrength: 1, jobId: null, credits: 0, createdAt: 't' },
    candidates: [], lighting: '', materials: '', elements: [], extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't', ...o }
  const f = path.join(w.pub, ...biblePaths(WORLD).file.split('/'))
  mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(b))
  writeFileSync(path.join(w.pub, 'lab-assets', 'locations', 'm.png'), 'png')
  stampStills(w, b.version) // m5: a still with no Bible version is stale once the Bible has a master
}
const step = (c: string[]) => path.basename(c[1]).replace(/\.py$/, '')
const base = (a: string) => path.basename(a)
async function renderAndFinish(w: World, body: object) {
  const m = mount(w, w.runtime()); const r = await m.render(body)
  const id = r.body.render?.id as string
  if (r.status === 200) await until(() => !!JSON.parse(readFileSync(path.join(w.dirs.l2r, `${id}.json`), 'utf8')).finished)
  return { m, r, id, rec: () => JSON.parse(readFileSync(path.join(w.dirs.l2r, `${id}.json`), 'utf8')) }
}

describe('grade to the master', () => {
  it('finish order is grade -> sharpen -> grain; colormatch.py takes the strength and every step reads the one before', async () => {
    const w = world(); withMaster(w)
    const { id, rec } = await renderAndFinish(w, { grade: { strength: 0.6 } })
    expect(w.py.calls.map(step)).toEqual(['colormatch', 'sharpen', 'grain'])
    const [cm, sharpen, grain] = w.py.calls
    expect([cm[2], base(cm[3]), cm[4], base(cm[5]), cm[6], base(cm[7]), cm[8], cm[9], cm[10], cm[11]])
      .toEqual(['--target', 'm.png', '--in', `${id}-raw.mp4`, '--out', `${id}-grade.mp4`, '--strength', '0.6', '--fps', '24'])
    expect(base(sharpen[2])).toBe(`${id}-grade.mp4`) // sharpen works on the graded picture
    expect(base(grain[2])).toBe(`${id}-sharp.mp4`)
    expect(rec().grade).toEqual({ target: '/lab-assets/locations/m.png', method: 'reinhard-lab', bibleVersion: 2, strength: 0.6 })
    expect(rec().finished).toBeTruthy()
  })
  it('default strength 0.7; Finish again regrades the same way', async () => {
    const w = world(); withMaster(w)
    const { m, id, rec } = await renderAndFinish(w, { grade: {} })
    expect(rec().grade.strength).toBe(0.7)
    w.py.calls.length = 0
    expect((await m.finish(id)).status).toBe(200)
    expect(w.py.calls.map(step)).toEqual(['colormatch', 'sharpen', 'grain'])
    expect(w.py.calls[0].slice(-4)).toEqual(['--strength', '0.7', '--fps', '24'])
  })
  it('m4: a render recorded before `strength` existed re-finishes at the default 0.7, not the full match', async () => {
    const w = world(); withMaster(w)
    const { m, id, rec } = await renderAndFinish(w, { grade: {} })
    const f = path.join(w.dirs.l2r, `${id}.json`), r = rec(); delete r.grade.strength; delete r.finished
    writeFileSync(f, JSON.stringify(r))
    w.py.calls.length = 0
    expect((await m.finish(id)).status).toBe(200)
    expect(w.py.calls[0].slice(-4)).toEqual(['--strength', '0.7', '--fps', '24'])
  })
  it('a render asked without a grade finishes sharpen -> grain and records none', async () => {
    const w = world(); withMaster(w)
    const { rec } = await renderAndFinish(w, {})
    expect(w.py.calls.map(step)).toEqual(['sharpen', 'grain']); expect(rec()).not.toHaveProperty('grade')
  })
  it('grade with no approved master: 409 no_master, nothing submitted; a bad strength is 400', async () => {
    const w = world(); const m = mount(w, w.runtime())
    const r = await m.render({ grade: { strength: 0.7 } })
    expect([r.status, r.body.code]).toEqual([409, 'no_master']); expect(w.jobs.submits).toBe(0)
    withMaster(w)
    expect((await m.render({ grade: { strength: 3 } })).status).toBe(400)
    expect(w.jobs.submits).toBe(0)
  })
  it('the status names the grade target so the screen can offer it', async () => {
    const w = world(); withMaster(w)
    expect((await mount(w, w.runtime()).status()).body.gradeTarget).toEqual({ png: '/lab-assets/locations/m.png', bibleVersion: 2 })
  })
})
