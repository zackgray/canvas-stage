// Fix wave 2026-10-24 (T1a): the set stops defaulting to the war camp. The presets are genre-neutral examples on the drawn sky,
// and nothing in the plan code pads a set with war-camp filler: an unfilled set stays unfilled.
import { describe, expect, it } from 'vitest'
import type { ScenePlan } from '../contract.ts'
import { parsePlan, repairPlan } from '../plan.ts'
import { DEFAULT_SKY } from '../planRules.ts'
import { PLANS, WALK_TOWARD } from '../presets.ts'

/** the war-camp vocabulary every QA set was dressed in */
const WAR_KINDS = ['spear', 'banner', 'weaponRack', 'palisade', 'barricade', 'tent', 'wagon', 'cart', 'crates', 'barrels', 'fire', 'campfireRing', 'debris', 'hut']
const WAR_WORDS = /\b(battle|battlefield|war|camp|soldier|medieval|spears?|banners?|palisade|burnt|burning|smoke|aftermath)\b/i

describe('the presets are genre-neutral', () => {
  for (const [name, plan] of Object.entries(PLANS)) {
    it(`${name}: parses, uses no war-camp piece or words, sits on the drawn sky, and keeps the default walk clear`, () => {
      expect(parsePlan(plan).ok).toBe(true)
      expect(plan.kit.map((k) => k.kind).filter((k) => WAR_KINDS.includes(k))).toEqual([])
      expect(plan.sentence).not.toMatch(WAR_WORDS)
      expect(plan.sky.url).toBe(DEFAULT_SKY)
      const [x0, z0, x1, z1] = plan.flat!
      expect(WALK_TOWARD.path.every(([x, z]) => x > x0 && x < x1 && z > z0 && z < z1)).toBe(true)
    })
  }
  it('the list is the four examples, without the battlefield', () => {
    expect(Object.keys(PLANS)).toEqual(['open-field-day', 'country-road-dusk', 'desert-noon', 'snowy-dawn'])
  })
})

describe('the plan code never pads a set', () => {
  const kinds = (p: ScenePlan) => p.kit.map((k) => k.kind)
  it('an empty kit stays empty through repair', () => {
    for (const raw of [{ seed: 1, sky: { url: DEFAULT_SKY }, kit: [] }, { seed: 1 }, {}, null]) expect(repairPlan(raw).plan.kit).toEqual([])
  })
  it('repair only keeps, moves or drops what the plan had; it never adds a piece', () => {
    const raws: unknown[] = [
      { seed: 2, sky: { url: DEFAULT_SKY }, kit: [{ kind: 'rock', at: [8, -20] }, { kind: 'treeline', args: [120], at: [0, -70] }] },
      { seed: 3, sky: {}, kit: [{ kind: 'hut', at: [0, -10] }, { kind: 'nope', at: [1, 1] }, { kind: 'mound', args: [20], at: [0, -40] }] },
      ...Object.values(PLANS),
    ]
    for (const raw of raws) {
      const before = ((raw as { kit: { kind: string }[] }).kit).map((k) => k.kind), after = kinds(repairPlan(raw).plan)
      expect(after.length).toBeLessThanOrEqual(before.length)
      expect(after.every((k) => before.includes(k))).toBe(true)
    }
  })
})
