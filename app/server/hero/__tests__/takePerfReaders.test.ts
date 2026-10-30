// Per-take performance, the server readers (PLAN-PER-TAKE-PERFORMANCE.md §3, WP2): a take locked on one walk keeps drawing,
// judging and wording from that walk after the scene's walk changes (its own frame-0 pose and its own extras), while who plays the
// hero is the scene's one choice. A legacy take whose walk already moved (no copy, packId no longer the scene's) keeps today's
// behaviour: the scene's walk, and its prepared frames stay renderable. Every reader goes through takeKitWorldFor. Free, no Cloud.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { StillPreviewResponse } from '../../../src/shared/stillPressContract.ts'
import { CREATURE_KIND, type ExtraPlan } from '../../../src/stage3d/contract.ts'
import { mocapPackId } from '../../../src/stage3d/planHash.ts'
import { JSON_LOCAL } from '../../project/__tests__/rig.ts'
import { KitStore } from '../../stage3d/store.ts'
import { takeKitWorldFor } from '../../stage3d/takeKitWorldFor.ts'
import { defaultPrompt } from '../../l2r/compose.ts'
import { castMoved } from '../../l2r/inputs.ts'
import { startOf } from '../kitInputs.ts'
import { stagedOf } from '../judge.ts'
import { kitInfo, kitTake, type KitTake } from './kitRig.ts'
import { mount, TAKE } from './rig.ts'

const EX: ExtraPlan = { path: [[-6, -9], [6, -8.4]], gait: 'run', delay: 0.7, costume: 'modern', variant: 2, tag: 'runner' }
const BEAST = { kind: CREATURE_KIND, action: 'roar' as const, at: [5, -15] as [number, number] }
/** the scene's new walk: the person stands (idle from the first frame) on another path, and no extras */
const STAND = { path: [[3, -2], [6, -2]] as [number, number][], actions: [{ kind: 'idle' as const, at: 0, seconds: 3 }], castId: 'ana' }

const hero = (t: KitTake) => mount(t, t.runtime({ fetchInfo: async () => kitInfo() }))
const preview = async (t: KitTake) => (await hero(t).raw('/preview', { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify({ takeId: TAKE }) })).body as unknown as StillPreviewResponse
const takeFile = (t: KitTake) => path.join(t.shot, 'take.json')
const readTakeJson = (t: KitTake) => JSON.parse(readFileSync(takeFile(t), 'utf8'))

/** the rig's kit take, its scene walking with an extra and a creature, the take locked on that walk (packId its hash); `copy` = it holds its copy */
function lockedOnWalk(copy: boolean) {
  const t = kitTake()
  const kits = new KitStore(t.pub)
  const walk = kits.savePerformance(t.kit.id, { ...t.kit.perf, extras: [EX], creatures: [BEAST] }).perf
  const take = { ...readTakeJson(t), packId: mocapPackId(walk), ...(copy ? { perf: walk, perfFrom: 'lock' } : {}) }
  writeFileSync(takeFile(t), JSON.stringify(take))
  return { t, kits, walk }
}

describe('a locked take after the scene\'s walk changed', () => {
  it('reads its own walk: frame-0 spot, extras and the still\'s words; the scene\'s walk does not reach it', async () => {
    const { t, kits, walk } = lockedOnWalk(true)
    const before = await preview(t)
    const words = await defaultPrompt(t.pub, readTakeJson(t)) // Render's default words (extras and creatures from the take's walk)
    kits.savePerformance(t.kit.id, STAND)
    const w = takeKitWorldFor(t.pub, readTakeJson(t))!
    expect(w.perfState).toBe('own')
    expect(startOf(w)).toEqual(walk.path[0]) // the judge's and the still's frame-0 spot (both walks begin on the mark)
    expect(w.perf.path).toEqual(walk.path)
    expect(kits.read(t.kit.id).perf.path).not.toEqual(walk.path)
    expect(stagedOf(w, null).map((s) => s.entity)).toEqual(['hero', 'extra:0:2']) // the face passes' and the judge's people
    const after = await preview(t)
    expect(after.composed).toBe(before.composed) // the draw's words: still the walk, never the new stand
    expect(after.composed).toMatch(/walking/) // the frame-0 pose: the take walks; the scene now stands
    expect(after.composed).not.toMatch(/standing/)
    expect(words).toMatch(/looms in the background/)
    expect(await defaultPrompt(t.pub, readTakeJson(t))).toBe(words)
  })

  it('a take with no copy yet is adopted before the walk is saved over, and then reads that walk', async () => {
    const { t, kits, walk } = lockedOnWalk(false)
    kits.savePerformance(t.kit.id, STAND)
    expect(readTakeJson(t)).toMatchObject({ perf: walk, perfFrom: 'adopted' })
    const w = takeKitWorldFor(t.pub, readTakeJson(t))!
    expect([w.perfState, startOf(w), w.perf.extras]).toEqual(['adopted', walk.path[0], [EX]])
  })

  it('who plays the hero is the scene\'s: a recast after the lock reaches the take, the still made for the old card goes stale', () => {
    const { t, kits } = lockedOnWalk(true)
    kits.savePerformance(t.kit.id, { ...kits.read(t.kit.id).perf, castId: 'bo' })
    const take = readTakeJson(t)
    expect(take.perf.castId).toBe('ana') // the copy keeps what it was locked with; readers lay the scene's over it
    expect(takeKitWorldFor(t.pub, take)!.perf.castId).toBe('bo')
    expect(castMoved(t.pub, { castId: 'ana' } as never, take)).toBe(true)
  })
})

describe('legacy takes keep today\'s behaviour', () => {
  it('a take whose walk moved before copies existed reads the scene\'s walk (unmatched); one with no performer reads it too (none)', () => {
    const t = kitTake() // the rig's packId is not the scene's walk and the take has no copy
    const scene = new KitStore(t.pub).read(t.kit.id).perf
    expect(takeKitWorldFor(t.pub, readTakeJson(t))).toMatchObject({ perfState: 'unmatched', perf: scene })
    expect(takeKitWorldFor(t.pub, { ...readTakeJson(t), packId: null })).toMatchObject({ perfState: 'none', perf: scene })
    expect(takeKitWorldFor(t.pub, { ...readTakeJson(t), worldId: 'loc-2026-01-01T00-00-00-000' })).toBeNull() // no kit world
  })
})
