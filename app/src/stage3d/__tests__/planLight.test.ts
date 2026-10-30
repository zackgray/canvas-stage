// Track F (prompt wave): kit labels validate and survive repair; the brief's light maps to the plan's light recipe.
import { describe, expect, it } from 'vitest'
import type { ScenePlan } from '../contract.ts'
import { parsePlan, repairPlan } from '../plan.ts'
import { DEFAULT_SKY } from '../planRules.ts'
import { LABEL_MAX, azimuthOf, lightRecipe } from '../planLight.ts'

const plan = (kit: unknown[]) => ({ seed: 1, sentence: 'x', sky: { url: DEFAULT_SKY }, kit }) as unknown as ScenePlan

describe('kit item labels', () => {
  it('validates and keeps a label, on a mound too', () => {
    const r = parsePlan(plan([{ kind: 'haystack', at: [8, -20], label: 'apple trees heavy with fruit' }, { kind: 'mound', at: [0, -40], label: 'a bank' }]))
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.plan.kit[0].label).toBe('apple trees heavy with fruit'); expect(r.plan.kit[1].label).toBe('a bank') }
  })
  it('rejects a non-text or over-long label and names the field', () => {
    const a = parsePlan(plan([{ kind: 'rock', at: [8, -20], label: 5 }])), b = parsePlan(plan([{ kind: 'rock', at: [8, -20], label: 'x'.repeat(LABEL_MAX + 1) }]))
    expect(a.ok ? '' : a.errors.join()).toMatch(/kit\[0\]\.label: must be a string/)
    expect(b.ok).toBe(false)
  })
  it('repair keeps a label (trimmed, capped) and drops junk with a note', () => {
    const r = repairPlan(plan([{ kind: 'rock', at: [8, -20], label: '  white hive  ' }, { kind: 'rock', at: [9, -20], label: 7 }, { kind: 'rock', at: [10, -20], label: 'y'.repeat(500) }]))
    expect(r.plan.kit[0].label).toBe('white hive'); expect(r.plan.kit[1].label).toBeUndefined(); expect(r.plan.kit[2].label).toHaveLength(LABEL_MAX)
    expect(r.notes.join()).toMatch(/kit\[1\]\.label: not text/)
  })
  it('an item with no label stays valid', () => expect(parsePlan(plan([{ kind: 'rock', at: [8, -20] }])).ok).toBe(true))
})

describe('lightRecipe from the brief light', () => {
  const L = (height: 'low' | 'high' | 'overhead' | '', direction: string, quality: 'hard' | 'soft' | '' = '') => lightRecipe({ height, direction, quality })
  it('a low sun behind the subject is the golden-hour recipe', () => {
    expect(L('low', 'behind her, towards camera')).toEqual({ fill: 1.4, key: 1.1, keyDir: [15, 12] })
  })
  it('reads the side and the front, and "behind the camera" is not behind the subject', () => {
    expect(azimuthOf('from the left of frame')).toBe(270); expect(azimuthOf('from the right')).toBe(90)
    expect(azimuthOf('behind the camera')).toBe(160); expect(azimuthOf('behind him, from the left')).toBe(330); expect(azimuthOf('')).toBe(140)
  })
  it('height sets elevation; soft light lowers the key; no height = no recipe', () => {
    expect(L('high', '')?.keyDir[1]).toBe(55); expect(L('overhead', '')?.keyDir[1]).toBe(75)
    expect(L('low', '', 'soft')).toMatchObject({ key: 0.88, fill: 1.7 })
    expect(L('', 'from the left')).toBeNull(); expect(lightRecipe(undefined)).toBeNull()
  })
  it('every recipe is a valid plan light', () => {
    for (const h of ['low', 'high', 'overhead'] as const) for (const d of ['', 'behind her', 'from the left', 'over the camera']) {
      const r = L(h, d, 'soft')!; expect(parsePlan({ ...plan([]), light: r }).ok).toBe(true)
    }
  })
})
