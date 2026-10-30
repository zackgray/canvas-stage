// Owner 10-29: a hand-flown take, locked and prepared, then a piece built on its set. (S2, PLAN-PER-TAKE-SET.md) A take that holds its
// own set keeps it: its frames and stills stay valid however the scene's set moves on, and its frames are prepared again only from
// that set. A take whose set moved before copies existed (moved on disk here, as the real scenes did) is not recorded again: its
// frames are prepared again from the scene's set (the same free finish, real ffmpeg), on the same take record, camera samples, lens
// and timing unchanged, its set key stamped with the key the page sent and a copy of that set stored. Before that, the clay says it is
// behind the set and every press refuses (Render, the still); after it, nothing refuses on the set, while a still drawn before stays stale.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { shotPaths, type ClayExport, type TakeRecord } from '../../../src/shared/shotContract.ts'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { setKeyOf } from '../../../src/studio/shoot/setKey.ts'
import { currentSetKey } from '../../bible/setGate.ts'
import { refuseSetMoved } from '../../hero/kitInputs.ts'
import { readiness, stillSetMoved } from '../../l2r/inputs.ts'
import { FILES, KitStore } from '../../stage3d/store.ts'
import { lockTake, readTake } from '../../takes/store.ts'
import { ClayService } from '../service.ts'

const FRAMES = 9
let pub = ''
let kitId = ''
const samples = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ t: i / 24, position: [i * 0.1, 1.6, -i * 0.05] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number], focal: 24 + i, focus: 3 }))
const clayDir = (take: string) => path.join(pub, shotPaths(take).clay)
const until = async (ok: () => boolean, ms = 60_000) => { const t0 = Date.now(); while (!ok()) { if (Date.now() - t0 > ms) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 50)) } }
const tick = () => new Promise((r) => setTimeout(r, 20))
const readClay = (take: string) => JSON.parse(readFileSync(path.join(clayDir(take), 'clay.json'), 'utf8')) as ClayExport
function writeFinals(take: string) {
  mkdirSync(clayDir(take), { recursive: true })
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=1920x1088:r=24', '-frames:v', String(FRAMES), '-start_number', '0', path.join(clayDir(take), 'final_%03d.png')], { windowsHide: true })
}
const service = () => new ClayService({ publicDir: pub, appDir: pub, python: () => undefined, yunet: path.join(pub, 'none.onnx'), hasFfmpeg: () => true, runner: { flushMs: 0, keepFrames: () => false } })
/** the free prepare: `setKey` is what the page sends (undefined = an older page that sends none) */
async function prepare(svc: ClayService, take: TakeRecord, setKey?: string) {
  writeFinals(take.id)
  expect(svc.finish({ takeId: take.id, ...(setKey !== undefined ? { setKey } : {}) }).code).toBe(202)
  await until(() => readClay(take.id).status !== 'running')
  expect(readClay(take.id).status).toBe('done')
}
const codes = (take: string) => readiness(pub, take).missing.map((m) => m.code)
const lock = (setKey: string, at: string) =>
  lockTake(pub, { worldId: kitId, packId: 'mocap-0000beef', fps: 24, frames: FRAMES, focal: 24, viewAspect: 16 / 9, perfStart: 0, samples, setKey }, new Date(at)).take
/** a piece moved through the kit store (adoption runs first) */
const moveKit = () => new KitStore(pub).changeKit(kitId, (p) => p.kit.map((it, i) => (i === 0 ? { ...it, at: [it.at[0] + 2, it.at[1]] as [number, number] } : it)))
/** a piece moved on disk the way sets moved before copies existed: plan.json and kit.setChangedAt written, no adoption */
/** the take as it was before copies existed: its set fields taken off take.json */
function legacyTake(id: string) {
  const f = path.join(pub, shotPaths(id).take)
  const { set: _s, setFrom: _f, setSince: _g, ...rest } = JSON.parse(readFileSync(f, 'utf8')) as TakeRecord // eslint-disable-line @typescript-eslint/no-unused-vars
  writeFileSync(f, JSON.stringify(rest))
}
function legacyMove(dx: number) {
  const store = new KitStore(pub), dir = store.dir(kitId)
  const plan = store.read(kitId).plan
  writeFileSync(path.join(dir, FILES.plan), JSON.stringify({ ...plan, kit: plan.kit.map((it, i) => (i === 0 ? { ...it, at: [it.at[0] + dx, it.at[1]] } : it)) }))
  const meta = JSON.parse(readFileSync(path.join(dir, FILES.meta), 'utf8'))
  writeFileSync(path.join(dir, FILES.meta), JSON.stringify({ ...meta, kit: { ...meta.kit, setChangedAt: new Date().toISOString() } }))
}

beforeAll(() => {
  pub = mkdtempSync(path.join(tmpdir(), 'set-reprep-'))
  kitId = new KitStore(pub).create({ plan: BATTLEFIELD, description: 'set re-prepare test' }, new Date('2026-10-29T15:00:00.000Z')).id
})
afterAll(() => rmSync(pub, { recursive: true, force: true }))

describe('a take that holds its own set', () => {
  it('keeps its frames and its still valid when the scene\'s set moves on (the whole point), and re-prepares only from its own set', async () => {
    const setKey = currentSetKey(pub, kitId)!
    const take = lock(setKey, '2026-10-29T16:00:00.000Z')
    const svc = service()
    await prepare(svc, take, setKey)
    expect(readClay(take.id).setKey).toBe(setKey)
    const drawn = { createdAt: new Date().toISOString(), setKey }
    await tick()
    // the first prepare on the scene's set already stored a copy of it; the move (adoption runs first) never replaces it
    expect(readTake(pub, take.id)!.setFrom).toBe('reprepare')
    moveKit()
    expect(currentSetKey(pub, kitId)).not.toBe(setKey)
    const after = readTake(pub, take.id)!
    expect([after.setKey, after.setFrom, setKeyOf(after.set!)]).toEqual([setKey, 'reprepare', setKey])
    expect((svc.status(take.id).body as { clay: ClayExport }).clay.setMoved).toBeUndefined()
    expect(codes(take.id)).not.toContain('clay_set_moved')
    expect(codes(take.id)).not.toContain('clay_stale')
    expect(() => refuseSetMoved(pub, after)).not.toThrow()
    expect(stillSetMoved(pub, after, drawn)).toBeNull()
    expect(stillSetMoved(pub, after, { createdAt: drawn.createdAt })).toBeNull() // unstamped, made after the copy's setSince
    // a finish captured on the scene's set now is refused, free, nothing written
    const r = svc.finish({ takeId: take.id, setKey: currentSetKey(pub, kitId) })
    expect([r.code, (r.body as { code?: string }).code]).toEqual([409, 'set_mismatch'])
    expect(readClay(take.id).setKey).toBe(setKey)
    // an older page sends no key while the scene is on another set: it captured the scene's, refused too
    expect(svc.finish({ takeId: take.id }).code).toBe(409)
    // its own key: prepared again, the key and the copy unchanged
    await tick()
    await prepare(svc, take, setKey)
    expect(readTake(pub, take.id)).toMatchObject({ setKey, set: after.set, setFrom: 'reprepare', setSince: after.setSince })
    expect(codes(take.id)).not.toContain('clay_set_moved')
  })
})

describe('re-preparing a take whose set moved before copies existed', () => {
  it('keeps the take and its camera, stamps the sent set key with a copy, and nothing refuses on the set afterwards', async () => {
    const setKey = currentSetKey(pub, kitId)!
    const take = lock(setKey, '2026-10-29T16:30:00.000Z')
    const svc = service()
    await prepare(svc, take)
    legacyTake(take.id)
    expect(codes(take.id)).not.toContain('clay_set_moved')
    const drawnBefore = { createdAt: new Date().toISOString() }

    await tick()
    legacyMove(2)
    const moved = currentSetKey(pub, kitId)!
    expect(moved).not.toBe(setKey)
    expect(readTake(pub, take.id)!.set).toBeUndefined()
    expect((svc.status(take.id).body as { clay: ClayExport }).clay.setMoved).toBeTruthy()
    expect(codes(take.id)).toContain('clay_set_moved')
    expect(readiness(pub, take.id).missing.find((m) => m.code === 'clay_set_moved')!.where).toMatch(/Draw the first frame/)
    expect(() => refuseSetMoved(pub, readTake(pub, take.id)!)).toThrow(/Draw the first frame again/)

    // a finish that names a third set (the page captured something else) is refused, free, nothing written
    const third = svc.finish({ takeId: take.id, setKey: 'deadbeef' })
    expect([third.code, (third.body as { code?: string }).code]).toEqual([409, 'set_mismatch'])
    expect(readTake(pub, take.id)!.setKey).toBe(setKey)

    // the draw's free prepare, again: the same finish on the same take, with the key the page sent
    await tick()
    await prepare(svc, take, moved)
    const after = readTake(pub, take.id)!
    expect(after.id).toBe(take.id)
    expect(JSON.stringify(after.samples)).toBe(JSON.stringify(take.samples))
    expect([after.startKey, after.focal, after.frames, after.fps, after.perfStart, after.lockedAt]).toEqual([take.startKey, take.focal, take.frames, take.fps, take.perfStart, take.lockedAt])
    expect([after.setKey, after.setFrom, setKeyOf(after.set!)]).toEqual([moved, 'reprepare', moved])
    expect(after.setSince).toBe(new KitStore(pub).setChangedAt(kitId))
    expect(readClay(take.id).setKey).toBe(moved)
    expect((svc.status(take.id).body as { clay: ClayExport }).clay.setMoved).toBeUndefined()
    expect(codes(take.id)).not.toContain('clay_set_moved')
    expect(() => refuseSetMoved(pub, after)).not.toThrow()
    // a still drawn on the old set stays stale; one drawn now is not
    expect(stillSetMoved(pub, after, drawnBefore)).toBeTruthy()
    expect(stillSetMoved(pub, after, { createdAt: new Date().toISOString() })).toBeNull()
    // from now on it keeps that set: the scene moving on again leaves its frames valid
    await tick()
    legacyMove(1)
    expect(codes(take.id)).not.toContain('clay_set_moved')
    // the same move locked again on the set it was prepared on is this take, not a new one
    const again = lockTake(pub, { worldId: kitId, packId: 'mocap-0000beef', fps: 24, frames: FRAMES, focal: 24, viewAspect: 16 / 9, perfStart: 0, samples, setKey: moved }, new Date())
    expect([again.take.id, again.reused]).toEqual([take.id, true])
  })

  it('an older page (no key sent) still re-prepares on the scene\'s set and stamps its key now', async () => {
    const setKey = currentSetKey(pub, kitId)!
    const take = lock(setKey, '2026-10-29T17:00:00.000Z')
    const svc = service()
    await prepare(svc, take)
    legacyTake(take.id)
    await tick()
    legacyMove(3)
    const moved = currentSetKey(pub, kitId)!
    expect(codes(take.id)).toContain('clay_set_moved')
    await tick()
    await prepare(svc, take)
    expect(readTake(pub, take.id)).toMatchObject({ setKey: moved, setFrom: 'reprepare' })
    expect(codes(take.id)).not.toContain('clay_set_moved')
  })
})
