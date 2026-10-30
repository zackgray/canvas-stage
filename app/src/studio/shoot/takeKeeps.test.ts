// What a locked take keeps (takeKeeps.ts): the summary words, the "lock again" badge rule, the on-show line, and the Draw gate's
// "Loading <take>'s walk and set…" for a take just picked (heroCapture.ts openingBlock).
import { describe, expect, it } from 'vitest'
import type { KitPerformance } from '../../../server/stage3d/types'
import type { ScenePlan } from '../../stage3d/contract'
import { mocapPackId } from '../../stage3d/planHash'
import { openingBlock } from './heroCapture'
import { keepsSummary, onShowWords, relockWords, takeKeeps, takeName } from './takeKeeps'
import { setKeyOf } from './setKey'

const perf = (o: Partial<KitPerformance> = {}): KitPerformance => ({ path: [[0, 0], [2, 0]], castId: 'c', ...o }) as KitPerformance
const plan = (x: number): ScenePlan => ({ seed: 1, sentence: 's', sky: { url: 'u', look: 'dusk' }, kit: [{ kind: 'crates', at: [x, 0] }] }) as ScenePlan
const rec = (o: object = {}) => ({ id: 'take-2026-10-29T10-00-00-000', packId: null as string | null, ...o }) as never

describe('what a take keeps', () => {
  it('names the take by its own name, else the way the list labels it', () => {
    expect(takeName({ id: 'take-2026-10-29T10-00-00-000', name: 'Wide' })).toBe('Wide')
    expect(takeName({ id: 'take-2026-10-29T10-00-00-000' })).toMatch(/^Take/)
  })

  it('summarises a walk and a set off the record alone', () => {
    const p = perf({ stand: true, shotSeconds: 6 })
    const t = rec({ perf: p, packId: mocapPackId(p), set: plan(1), setKey: setKeyOf(plan(1)) })
    const k = takeKeeps(t, null)
    expect(keepsSummary(t, k)).toBe('Walk: stands · 6 s · own set')
    const q = perf()
    const w = rec({ perf: q, packId: mocapPackId(q) })
    expect(keepsSummary(w, takeKeeps(w, null))).toBe('Walk: walks')
    expect(keepsSummary(rec(), takeKeeps(rec(), null))).toBe('')
  })

  it('a copy that no longer hashes to the take is not a copy', () => {
    const t = rec({ perf: perf(), packId: 'mocap-other' })
    expect(takeKeeps(t, null).walk).toBe(false)
  })

  it('needs locking again only when there is no copy and the scene moved on', () => {
    const p = perf()
    const k = (t: object, scene: { packId: string | null; setKey: string | null } | null) => relockWords(takeKeeps(rec(t), scene))
    expect(k({ packId: 'mocap-a' }, { packId: 'mocap-b', setKey: null })).toBe('Lock again to keep its walk')
    expect(k({ packId: 'mocap-a' }, { packId: 'mocap-a', setKey: null })).toBeNull() // the scene still has it: it is adopted, not lost
    expect(k({ packId: mocapPackId(p), perf: p }, { packId: 'mocap-b', setKey: null })).toBeNull() // it holds its own copy
    expect(k({ setKey: 'a' }, { packId: null, setKey: 'b' })).toBe('Lock again to keep its set')
    expect(k({ packId: 'mocap-a', setKey: 'a' }, { packId: 'mocap-b', setKey: 'b' })).toBe('Lock again to keep its walk and set')
    expect(k({ packId: 'mocap-a' }, null)).toBeNull() // the scene is not read yet: no guess
    expect(k({ packId: null }, { packId: 'mocap-b', setKey: 'b' })).toBeNull() // no 3D performer, no set key: nothing to keep
  })

  it('one line for the walk, the set, or both', () => {
    expect(onShowWords('Take 3', true, false)).toBe('Take 3 is on show with its own walk. Changes here are for the next take you record; Take 3 keeps its walk.')
    expect(onShowWords('Take 3', false, true)).toBe('Take 3 is on show with its own set. Changes here are for the next take.')
    expect(onShowWords('Take 3', true, true)).toBe('Take 3 is on show with its own walk and set. Changes here are for the next take you record; Take 3 keeps its walk and set.')
  })
})

describe('Draw while a just-picked take loads', () => {
  const stage = (pack: string | null) => ({ world: { performance: pack ? { pack: { id: pack } } : null } }) as never
  const own = { worldId: 'w', packId: 'mocap-a', id: 'take-2026-10-29T10-00-00-000', name: 'Wide', perf: perf() }
  it('says what it is waiting for, by the take\'s name', () => {
    expect(openingBlock(stage(null), own, 'w')).toBe("Loading Wide's walk and set…")
    expect(openingBlock(stage('mocap-b'), own, 'w')).toBe("Loading Wide's walk and set…")
  })
  it('a take with nothing of its own keeps the old words', () => {
    expect(openingBlock(stage(null), { worldId: 'w', packId: 'mocap-a', id: 'x' }, 'w')).toBe("Put the take's performance on the set first.")
    expect(openingBlock(stage('mocap-b'), { worldId: 'w', packId: 'mocap-a', id: 'x' }, 'w')).toMatch(/not the one this take was filmed with/)
  })
})
