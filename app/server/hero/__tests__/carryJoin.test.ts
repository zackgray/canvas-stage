// CARRY across the other tracks' joins, through the real routes: a still redrawn and kept (`<id>-r1`, the approved one) is what a re-lock
// with an unchanged frame 0 carries; the carried still opens in the judge with its people once the new take's frames are prepared
// (the judge reads the take's own clay, not the carried frame-0 capture); and a redraw on the carried still keeps counting on (-r2).
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PassCandidate } from '../../../src/shared/passContract.ts'
import { shotPaths, type TakeRecord } from '../../../src/shared/shotContract.ts'
import { call, JSON_LOCAL, post } from '../../project/__tests__/rig.ts'
import { labPasses } from '../../passes/plugin.ts'
import { resetRegistry } from '../../passes/registry.ts'
import { carryOpening } from '../carry.ts'
import type { StillJudge } from '../redrawSpec.ts'
import { heroDirOf, listStills } from '../store.ts'
import { mount } from './rig.ts'
import { redrawJob, redrawTake, STILL_ID, type RedrawTake } from './redrawRig.ts'

type H = Parameters<typeof call>[0]
const JOB = (n: number) => `cccccccc-0000-4000-8000-00000000000${n}`
const NEXT = 'take-2026-10-25T12-00-00-000'
const noJobs = { list: () => [] } as unknown as Parameters<typeof listStills>[2]

function setup(t: RedrawTake) {
  const hero = mount(t, t.runtime({ fetchInfo: async () => t.info }))
  const routes: Record<string, H> = {}
  ;(labPasses().configureServer as (s: unknown) => void)({ config: { root: t.root, publicDir: t.pub }, middlewares: { use: (p: string, h: H) => { routes[p] = h } } })
  const body = (b: unknown) => ({ method: 'POST', headers: JSON_LOCAL, body: JSON.stringify(b) })
  return {
    redraw: async (takeId: string, stillId: string) => ((await hero.raw('/redraw', body({ takeId, stillId, pass: 'face', subject: 'hero' }))).body as { candidate: PassCandidate }).candidate,
    keep: (id: string) => post(routes['/__lab/passes'], '/keep', { id }),
    judge: async (takeId: string, stillId: string) => (await hero.raw(`/judge?take=${takeId}&still=${stillId}`)).body as StillJudge,
  }
}
/** the take re-locked with frame 0 unchanged: a new id, the same start and frame-0 key (a fix later in the performance) */
function relock(t: RedrawTake): TakeRecord {
  const a: TakeRecord = { ...t.take, frame0Key: '0f0f0f0f', lockedAt: '2026-10-25T11:00:00.000Z' }
  writeFileSync(path.join(t.pub, shotPaths(a.id).take), JSON.stringify(a))
  const b: TakeRecord = { ...a, id: NEXT, lockedAt: '2026-10-25T12:00:00.000Z' }
  mkdirSync(path.join(t.pub, shotPaths(b.id).root), { recursive: true })
  writeFileSync(path.join(t.pub, shotPaths(b.id).take), JSON.stringify(b))
  return b
}
/** Prepare the frames on the new take (free): its own clay, here the same frame 0 as the old take's */
function prepare(t: RedrawTake, b: TakeRecord) {
  const from = path.join(t.pub, shotPaths(t.take.id).clay), to = path.join(t.pub, shotPaths(b.id).clay)
  cpSync(from, to, { recursive: true })
  const clay = JSON.parse(readFileSync(path.join(to, 'clay.json'), 'utf8'))
  writeFileSync(path.join(to, 'clay.json'), JSON.stringify({ ...clay, takeId: b.id }))
}

beforeEach(() => resetRegistry())

describe('carry x redraws x judge', () => {
  it('the kept redraw is the approved opening that carries; the judge has its people once frames are prepared; a redraw on it counts on', async () => {
    const t = redrawTake()
    t.queue.push(redrawJob(JOB(1)), redrawJob(JOB(2)))
    const s = setup(t)
    const a = await s.redraw(t.take.id, STILL_ID)
    expect((await s.keep(a.id)).status).toBe(200)
    const r1 = `${STILL_ID}-r1`

    const b = relock(t)
    expect(await carryOpening(t.pub, b, [t.take, b].map((x) => JSON.parse(readFileSync(path.join(t.pub, shotPaths(x.id).take), 'utf8'))))).toEqual({ stillId: r1, from: t.take.id })
    const carried = (await listStills(t.pub, b.id, noJobs)).filter((x) => x.approved)
    expect(carried.map((x) => [x.id, x.carriedFrom])).toEqual([[r1, t.take.id]])
    expect(readFileSync(path.join(heroDirOf(t.pub, b.id), `${r1}.png`))).toEqual(readFileSync(path.join(t.heroDir, `${r1}.png`))) // the kept picture, not the original
    expect(existsSync(path.join(heroDirOf(t.pub, b.id), `${STILL_ID}.json`))).toBe(false) // the replaced original stays behind

    // before the new take's frames are prepared the judge cannot see anyone (the carried frame-0 capture is not what it reads)
    const blind = await s.judge(b.id, r1)
    expect(blind.people.map((p) => p.status)).toEqual(['unknown', 'unknown'])
    expect(blind.flagged).toBe(true)
    prepare(t, b)
    const seen = await s.judge(b.id, r1)
    expect(seen.people.map((p) => [p.entity, p.status === 'unknown' ? 'unknown' : 'seen'])).toEqual([['hero', 'seen'], ['extra:0:0', 'seen']])

    const c = await s.redraw(b.id, r1)
    expect((await s.keep(c.id)).status).toBe(200)
    const after = await listStills(t.pub, b.id, noJobs)
    expect(after.filter((x) => x.approved).map((x) => x.id)).toEqual([`${STILL_ID}-r2`])
  })
})
