// The per-take walk and the per-take set, crossed (cleanup-2026-10-29 PLAN-PER-TAKE-PERFORMANCE.md + PLAN-PER-TAKE-SET.md, joining
// track): one take locked with its walk and its set, then the scene's walk changes and a prop moves. Adoption fires for a take with no
// copy and leaves the locked take byte for byte; the locked take's clay finish takes only its own walk and set (the scene's keys are
// refused free); its still guard, the set approval gate (an approval written before the approved-keys list existed) and Render's
// readiness read it as current; a take locked before copies whose walk and set moved before copies existed keeps the old rules.
// Real modules, the lock route's own sequence (lockPerf, lockSet, lockTake), real ffmpeg for the free finish, temp folders only.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { biblePaths } from '../../src/shared/bibleContract.ts'
import { shotPaths, type ClayExport, type TakeLockRequest, type TakeRecord } from '../../src/shared/shotContract.ts'
import { BATTLEFIELD } from '../../src/stage3d/presets.ts'
import { mocapPackId } from '../../src/stage3d/planHash.ts'
import { setKeyOf } from '../../src/studio/shoot/setKey.ts'
import { SET_APPROVAL_FILE } from '../bible/read.ts'
import { currentSetKey, setRefusalFor } from '../bible/setGate.ts'
import { approvedSetKeys } from '../bible/setKeys.ts'
import { BibleStore } from '../bible/store.ts'
import { ClayService } from '../clay/service.ts'
import { clayStampStale } from '../clay/stamps.ts'
import { refuseSetMoved } from '../hero/kitInputs.ts'
import { readiness, stillSetMoved } from '../l2r/inputs.ts'
import { FILES, KitStore } from '../stage3d/store.ts'
import { takeKitWorldFor } from '../stage3d/takeKitWorldFor.ts'
import { lockTake, readTake } from '../takes/store.ts'
import { adoptAllTakes, lockPerf } from '../takes/takePerf.ts'
import { adoptAllSets, lockSet } from '../takes/takeSet.ts'

const FRAMES = 9
let pub = '', kitId = ''
const samples = (dx: number) => [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ t: i / 24, position: [dx + i * 0.1, 1.6, -i * 0.05] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number], focal: 24 }))
const takeFile = (id: string) => path.join(pub, shotPaths(id).take)
const clayDir = (id: string) => path.join(pub, shotPaths(id).clay)
const readClay = (id: string) => JSON.parse(readFileSync(path.join(clayDir(id), 'clay.json'), 'utf8')) as ClayExport
const until = async (ok: () => boolean, ms = 60_000) => { const t0 = Date.now(); while (!ok()) { if (Date.now() - t0 > ms) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 50)) } }
const tick = () => new Promise((r) => setTimeout(r, 20))
const service = () => new ClayService({ publicDir: pub, appDir: pub, python: () => undefined, yunet: path.join(pub, 'none.onnx'), hasFfmpeg: () => true, runner: { flushMs: 0, keepFrames: () => false } })
const codes = (id: string) => readiness(pub, id).missing.map((m) => m.code)
const scene = () => new KitStore(pub).read(kitId)
/** what the page holds: the kit world as the server served it, over the wire */
const wire = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

function writeFinals(id: string) {
  mkdirSync(clayDir(id), { recursive: true })
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=1920x1088:r=24', '-frames:v', String(FRAMES), '-start_number', '0', path.join(clayDir(id), 'final_%03d.png')], { windowsHide: true })
}
/** the free finish with these stamps (absent = an older page): accepted and done */
async function prepare(svc: ClayService, id: string, stamps: { packId?: string | null; setKey?: string | null }) {
  writeFinals(id)
  expect(svc.finish({ takeId: id, ...stamps }).code).toBe(202)
  await until(() => readClay(id).status !== 'running')
  expect(readClay(id).status).toBe('done')
}

/** Lock take as the route runs it: the page's walk and set, checked against the request's keys, then the lock */
function lockAsRoute(dx: number, page: { perf?: unknown; set?: unknown }, at: string): TakeRecord {
  const w = scene()
  const q: TakeLockRequest = { worldId: kitId, packId: mocapPackId(w.perf), fps: 24, frames: FRAMES, focal: 24, viewAspect: 16 / 9, perfStart: 0, samples: samples(dx), setKey: setKeyOf(w.plan)! }
  const lp = lockPerf(pub, q, page.perf)
  const ls = lockSet(pub, { worldId: kitId, setKey: q.setKey }, page.set)
  if (!lp.ok || !ls.ok) throw new Error('the lock was refused')
  return lockTake(pub, q, new Date(at), undefined, lp.own, ls.own).take
}
/** a take as it was before copies existed: its walk and set fields taken off take.json */
function legacy(id: string) {
  const { perf: _p, perfFrom: _f, set: _s, setFrom: _g, setSince: _h, ...rest } = JSON.parse(readFileSync(takeFile(id), 'utf8')) as TakeRecord // eslint-disable-line @typescript-eslint/no-unused-vars
  writeFileSync(takeFile(id), JSON.stringify(rest))
}
/** the scene moved on disk the way it did before copies existed: no adoption ran */
function legacyMove() {
  const store = new KitStore(pub), dir = store.dir(kitId), w = store.read(kitId)
  writeFileSync(path.join(dir, FILES.plan), JSON.stringify({ ...w.plan, kit: w.plan.kit.map((it, i) => (i === 0 ? { ...it, at: [it.at[0] + 3, it.at[1]] } : it)) }))
  writeFileSync(path.join(dir, FILES.perf), JSON.stringify({ ...w.perf, path: [[0, -20], [1, 3]] }))
  const meta = JSON.parse(readFileSync(path.join(dir, FILES.meta), 'utf8'))
  writeFileSync(path.join(dir, FILES.meta), JSON.stringify({ ...meta, kit: { ...meta.kit, setChangedAt: new Date().toISOString() } }))
}

beforeAll(() => {
  pub = mkdtempSync(path.join(tmpdir(), 'per-take-x-'))
  kitId = new KitStore(pub).create({ plan: BATTLEFIELD, perf: { path: [[0, -20], [0, 4]] }, description: 'per-take intersection' }, new Date()).id
})
afterAll(() => rmSync(pub, { recursive: true, force: true }))

describe('a take locked with its own walk and set, after the scene\'s walk and set move on', () => {
  it('keeps both: adoption leaves it, its finish takes only its own keys, its still, approval and Render read it current', async () => {
    const svc = service()
    // L: a take locked and prepared before copies existed; the scene then moved on disk with no adoption (the real scenes did)
    const L = lockAsRoute(5, {}, new Date().toISOString())
    await prepare(svc, L.id, {})
    legacy(L.id)
    await tick()
    legacyMove()
    // the owner approved the set as it stands before the approved-keys list existed: the file holds key and at only
    const key1 = currentSetKey(pub, kitId)!
    const approval = path.join(pub, ...biblePaths(kitId).root.split('/'), SET_APPROVAL_FILE)
    mkdirSync(path.dirname(approval), { recursive: true })
    writeFileSync(approval, JSON.stringify({ key: key1, at: '2026-10-29T15:40:00.000Z' }))

    // T1 locked with the walk and the set the page holds; A locked by an older page (no copies sent, so the scene's are stored), then stripped
    await tick()
    const T1 = lockAsRoute(0, { perf: wire(scene().perf), set: wire(scene().plan) }, new Date().toISOString())
    expect([T1.perfFrom, T1.setFrom, T1.setKey]).toEqual(['lock', 'lock', key1])
    await prepare(svc, T1.id, { packId: T1.packId, setKey: T1.setKey })
    const A = lockAsRoute(1, {}, new Date().toISOString())
    legacy(A.id)
    const t1Before = readFileSync(takeFile(T1.id), 'utf8')

    // the scene's walk changes and a prop moves, through the kit store (adoption runs before each write)
    await tick()
    new KitStore(pub).savePerformance(kitId, { ...scene().perf, path: [[0, -20], [2, 6]] })
    new KitStore(pub).changeKit(kitId, (p) => p.kit.map((it, i) => (i === 0 ? { ...it, at: [it.at[0] + 1, it.at[1]] as [number, number] } : it)))
    const sceneKey = currentSetKey(pub, kitId)!, scenePack = mocapPackId(scene().perf)
    expect([sceneKey === T1.setKey, scenePack === T1.packId]).toEqual([false, false])
    expect(readFileSync(takeFile(T1.id), 'utf8')).toBe(t1Before) // T1 untouched
    expect(readTake(pub, A.id)).toMatchObject({ perfFrom: 'adopted', setFrom: 'adopted', setKey: key1 }) // A kept what it was locked on
    expect([adoptAllTakes(pub), adoptAllSets(pub)]).toEqual([[], []]) // the takes list GET has nothing left to adopt
    expect(readFileSync(takeFile(T1.id), 'utf8')).toBe(t1Before)

    // T1's world is its own walk and set
    const t1 = readTake(pub, T1.id)!
    const tw = takeKitWorldFor(pub, t1)!
    expect([tw.perfState, tw.setState, mocapPackId(tw.perf), setKeyOf(tw.plan)]).toEqual(['own', 'own', T1.packId, T1.setKey])

    // T1's clay finish: the scene's walk or the scene's set is refused free (nothing written); its own keys are accepted
    const clayBefore = readFileSync(path.join(clayDir(T1.id), 'clay.json'), 'utf8')
    const walkNo = svc.finish({ takeId: T1.id, packId: scenePack, setKey: T1.setKey })
    const setNo = svc.finish({ takeId: T1.id, packId: T1.packId, setKey: sceneKey })
    const oldPage = svc.finish({ takeId: T1.id })
    expect([walkNo.code, (walkNo.body as { code?: string }).code, setNo.code, (setNo.body as { code?: string }).code, oldPage.code])
      .toEqual([409, 'perf_mismatch', 409, 'set_mismatch', 409])
    expect(readFileSync(path.join(clayDir(T1.id), 'clay.json'), 'utf8')).toBe(clayBefore)
    await tick()
    await prepare(svc, T1.id, { packId: T1.packId, setKey: T1.setKey })
    expect(readClay(T1.id)).toMatchObject({ packId: T1.packId, setKey: T1.setKey })
    expect(readFileSync(takeFile(T1.id), 'utf8')).toBe(t1Before) // an own-set take is never restamped

    // the still guard and Render's readiness read T1's frames as current; the set approval gate passes its approved own set
    expect(clayStampStale(t1, readClay(T1.id))).toBe(false)
    expect(() => refuseSetMoved(pub, t1)).not.toThrow()
    expect(stillSetMoved(pub, t1, { createdAt: new Date().toISOString(), setKey: T1.setKey })).toBeNull()
    expect(stillSetMoved(pub, t1, { createdAt: new Date().toISOString(), setKey: sceneKey })).toBeTruthy()
    for (const c of ['clay_stale', 'clay_set_moved', 'clay_frames', 'no_clay', 'clay_not_done']) expect(codes(T1.id)).not.toContain(c)
    expect(setRefusalFor(pub, kitId, t1)).toBeNull() // approved before the keys list: its key still counts
    expect(setRefusalFor(pub, kitId)).not.toBeNull() // the scene's new set is not approved
    await new BibleStore(pub).approveSet(kitId, sceneKey)
    expect(approvedSetKeys(pub, kitId)).toEqual([key1, sceneKey]) // approving the new set keeps the old key
    expect(setRefusalFor(pub, kitId, t1)).toBeNull()

    // L (locked before copies, its walk and set moved before copies existed) keeps the old behaviour: the scene's walk and set
    const l = readTake(pub, L.id)!
    expect([l.perf, l.set]).toEqual([undefined, undefined])
    const lw = takeKitWorldFor(pub, l)!
    expect([lw.perfState, lw.setState, setKeyOf(lw.plan)]).toEqual(['unmatched', 'unmatched', sceneKey])
    expect(codes(L.id)).toContain('clay_set_moved')
    expect(() => refuseSetMoved(pub, l)).toThrow(/Draw the first frame again/)
    const lOld = svc.finish({ takeId: L.id, setKey: l.setKey })
    expect([lOld.code, (lOld.body as { code?: string }).code]).toEqual([409, 'set_mismatch'])
    await tick()
    await prepare(svc, L.id, { setKey: sceneKey }) // prepared again on the scene's set: it records that set from now on
    expect(readTake(pub, L.id)).toMatchObject({ setKey: sceneKey, setFrom: 'reprepare' })
    expect(codes(L.id)).not.toContain('clay_set_moved')
  })
})
