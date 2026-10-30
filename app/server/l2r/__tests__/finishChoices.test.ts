// Recipe wave, Track B: the hold preset rides the press; the grade is the FINISH's switch (free, followed by
// Finish again). A render made before this keeps working: its recorded grade is the finish default; a recorded depth-of-field mode is ignored.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { biblePaths, type BibleRecord } from '../../../src/shared/bibleContract.ts'
import { CLAY_DEPTH_UNIT_M, type ClayCamera, type ClayExport, type TakeRecord } from '../../../src/shared/shotContract.ts'
import { resetClaims } from '../../jobs/inflight.ts'
import { resetFinishing } from '../finish.ts'
import { parseFinish, parseRender } from '../plugin.ts'
import { FRAMES, mount, stampStills, until, WORLD, world, type World } from './rig.ts'

afterEach(() => { resetClaims(); resetFinishing() })

function withMaster(w: World) {
  const b: BibleRecord = { worldId: WORLD, version: 2, prompt: '', master: { id: 'm1', png: '/lab-assets/locations/m.png', madeBy: 'qwen', seed: 1, depthStrength: 1, jobId: null, credits: 0, createdAt: 't' },
    candidates: [], lighting: '', materials: '', elements: [], extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't' }
  const f = path.join(w.pub, ...biblePaths(WORLD).file.split('/'))
  mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(b))
  writeFileSync(path.join(w.pub, 'lab-assets', 'locations', 'm.png'), 'png')
  stampStills(w, b.version)
}
/** clay depth + cameras with focus: what "from the still" scales by (no lens needed; no live-DoF flag needed) */
function withDepth(w: World, focus = true) {
  const cf = path.join(w.dirs.clay, 'clay.json'); const clay = JSON.parse(readFileSync(cf, 'utf8')) as ClayExport
  clay.depth = { kind: 'planar', unitM: CLAY_DEPTH_UNIT_M, frames: FRAMES, width: 1920, height: 1088, pattern: 'zdepth_%03d.png' }
  writeFileSync(cf, JSON.stringify(clay))
  const cams: ClayCamera[] = Array.from({ length: FRAMES }, (_, i) => ({ i, t: i / 24, position: [0, 1.6, 0], quaternion: [0, 0, 0, 1], focal: 75, vfovDeg: 27, ...(focus ? { focus: 7.4 } : {}) }))
  writeFileSync(path.join(w.dirs.clay, 'cameras.json'), JSON.stringify({ frames: cams }))
  for (let i = 0; i < FRAMES; i++) writeFileSync(path.join(w.dirs.clay, `zdepth_${String(i).padStart(3, '0')}.png`), 'png')
}
const step = (c: string[]) => path.basename(c[1]).replace(/\.py$/, '')
const read = (w: World, id: string) => JSON.parse(readFileSync(path.join(w.dirs.l2r, `${id}.json`), 'utf8'))

/** a finished render, then the call log cleared */
async function finished(w: World, body: object = {}) {
  const m = mount(w, w.runtime()); const r = await m.render(body)
  const id = r.body.render.id as string
  await until(() => !!read(w, id).finished)
  w.py.calls.length = 0
  return { m, id }
}

describe('hold the clay: the press', () => {
  it('records the preset and sends the matching graph; none named = both stages, as a render always was', async () => {
    for (const [hold, stage2Layout] of [['wide', false], ['closeup', true], [undefined, true]] as const) {
      const w = world(); const m = mount(w, w.runtime())
      const r = await m.render(hold ? { hold } : {})
      expect(r.status).toBe(200)
      const g = w.submitted[0].json
      expect(!!g.h1_t).toBe(stage2Layout)
      expect(g.gd2_t.inputs.model).toEqual([stage2Layout ? 'ic' : 'unet', 0])
      expect(read(w, r.body.render.id).hold).toBe(hold ?? 'closeup')
      await until(() => !!read(w, r.body.render.id).finished)
      resetClaims(); resetFinishing()
    }
  })
  it('a preset that is not one is 400 before anything is made', async () => {
    const w = world(); const m = mount(w, w.runtime())
    const r = await m.render({ hold: 'huge' })
    expect([r.status, r.body.code, w.jobs.submits]).toEqual([400, 'bad_request', 0])
  })
  it('parseRender / parseFinish take the new fields and refuse bad ones', () => {
    expect(parseRender({ takeId: 'take-2026-10-22T19-00-00-000', stillId: 'still-2026-10-22T19-10-00-000', hold: 'wide', dof: 'still' })).toMatchObject({ hold: 'wide' })
    expect(parseFinish({ renderId: 'l2r-2026-10-22T19-00-00-000', grade: false, dof: 'off' })).toEqual({ renderId: 'l2r-2026-10-22T19-00-00-000', grade: false })
    expect(parseFinish({ renderId: 'l2r-2026-10-22T19-00-00-000' })).toEqual({ renderId: 'l2r-2026-10-22T19-00-00-000' })
    expect(() => parseFinish({ renderId: 'l2r-2026-10-22T19-00-00-000', grade: 'yes' })).toThrow(/grade must be/)
  })
})

describe('the grade is the finish\'s switch', () => {
  it('a render pressed with a grade: off at the finish (free) keeps the record; on again regrades at the recorded strength', async () => {
    const w = world(); withMaster(w)
    const { m, id } = await finished(w, { grade: { strength: 0.6 } })
    expect((await m.finish(id, { grade: false })).status).toBe(200)
    expect(w.py.calls.map(step)).toEqual(['sharpen', 'grain'])
    expect(read(w, id)).toMatchObject({ gradeOff: true, grade: { strength: 0.6 } })
    w.py.calls.length = 0
    expect((await m.finish(id)).status).toBe(200) // follows the record: still off
    expect(w.py.calls.map(step)).toEqual(['sharpen', 'grain'])
    w.py.calls.length = 0
    expect((await m.finish(id, { grade: true })).status).toBe(200)
    expect(w.py.calls.map(step)).toEqual(['colormatch', 'sharpen', 'grain'])
    expect(w.py.calls[0].slice(-4)).toEqual(['--strength', '0.6', '--fps', '24'])
    expect(read(w, id).gradeOff).toBeUndefined()
  })
  it('a render pressed without one can be graded at the finish, at a strength, and the record says so', async () => {
    const w = world(); withMaster(w)
    const { m, id } = await finished(w)
    expect(read(w, id).grade).toBeUndefined()
    expect((await m.finish(id, { grade: { strength: 0.5 } })).status).toBe(200)
    expect(w.py.calls[0].slice(-4)).toEqual(['--strength', '0.5', '--fps', '24'])
    expect(read(w, id).grade).toMatchObject({ target: '/lab-assets/locations/m.png', strength: 0.5 })
  })
  it('grade on with no approved master is 409 no_master, free, and the last good cut stays', async () => {
    const w = world()
    const { m, id } = await finished(w)
    const r = await m.finish(id, { grade: true })
    expect([r.status, r.body.code]).toEqual([409, 'no_master'])
    expect(w.py.calls).toEqual([])
    expect(read(w, id).finished).toBeTruthy()
  })
})

describe('there is no depth of field in the finish', () => {
  it('the finish is sharpen then grain; a dof in the request is ignored (no error, nothing recorded as applied)', async () => {
    const w = world(); withDepth(w)
    const { m, id } = await finished(w)
    expect((await m.finish(id)).status).toBe(200)
    expect(w.py.calls.map(step)).toEqual(['sharpen', 'grain'])
    w.py.calls.length = 0
    const r = await m.finish(id, { dof: 'still' })
    expect(r.status).toBe(200)
    expect(w.py.calls.map(step)).toEqual(['sharpen', 'grain'])
    expect(r.body.render.dof ?? null).toBeNull(); expect(r.body.render.dofMode).toBeUndefined()
  })
  it('a press or a finish that carries a dof is accepted and the field is dropped', () => {
    expect(parseRender({ takeId: 'take-2026-10-22T19-00-00-000', stillId: 'still-1', dof: 'still' })).not.toHaveProperty('dof') // (the old field is dropped)
    expect(parseFinish({ renderId: 'l2r-2026-10-22T19-00-00-000-ab12', dof: 'frames' })).not.toHaveProperty('dof')
  })
  it('a failed Finish again (the script dies) keeps the previous finished cut', async () => {
    const w = world()
    const { m, id } = await finished(w)
    writeFileSync(path.join(w.dirs.l2r, `${id}-finished.mp4`), 'good cut')
    w.py.fail = 'boom'
    expect((await m.finish(id, { grade: false })).status).toBe(500)
    expect(readFileSync(path.join(w.dirs.l2r, `${id}-finished.mp4`), 'utf8')).toBe('good cut')
    expect(existsSync(path.join(w.dirs.l2r, `${id}-finishing.mp4`))).toBe(false)
    expect(read(w, id).finishError).toMatch(/boom/)
  })
  it('a render that recorded a depth-of-field mode (older versions) finishes with its grade alone', async () => {
    const w = world(); withMaster(w); withDepth(w)
    const { m, id } = await finished(w, { grade: {} })
    const rec = read(w, id); delete rec.hold; rec.dofMode = 'still'; delete rec.finishedAt
    writeFileSync(path.join(w.dirs.l2r, `${id}.json`), JSON.stringify(rec))
    w.py.calls.length = 0
    expect((await m.finish(id)).status).toBe(200)
    expect(w.py.calls.map(step)).toEqual(['colormatch', 'sharpen', 'grain'])
  })
})
