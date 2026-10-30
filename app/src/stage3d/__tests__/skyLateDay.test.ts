// Track F (prompt wave): a low late sun reads as its own look (lateDay), not noon; the bare day words read as before.
import { describe, expect, it } from 'vitest'
import type { ScenePlan } from '../contract.ts'
import { DEFAULT_SKY } from '../planRules.ts'
import { skyLook, skyParams } from '../sky.ts'

const plan = (sentence: string, extra: Partial<ScenePlan> = {}): ScenePlan => ({ seed: 1, sentence, sky: { url: DEFAULT_SKY }, kit: [], ...extra })
const RUN1 = 'Late afternoon in an autumn orchard: a woman in a straw hat walks between the trees, low golden sun behind her, bees drifting in the light.'
const time = (s: string) => skyLook(plan(s)).time

describe('lateDay: a low late sun is not noon', () => {
  it('reads the run-1 sentence as lateDay, with a low sun and a horizon that is neither noon nor dusk', () => {
    expect(time(RUN1)).toBe('lateDay')
    const p = skyParams(plan(RUN1, { light: { keyDir: [20, 12] } }))
    expect(p.sunDir[1]).toBeCloseTo(Math.sin((12 * Math.PI) / 180), 5)
    expect(p.horizon).not.toBe(skyParams(plan('dusk')).horizon)
    expect(p.horizon).not.toBe(skyParams(plan('noon')).horizon)
  })
  it('the low-sun phrases read lateDay; the bare day words read as before', () => {
    for (const s of ['A field in golden hour.', 'A road under a low sun.', 'Evening light on the water.', 'Sunset light on the hills.', 'A backlit meadow.', 'In the late afternoon, a barn'])
      expect(time(s), s).toBe('lateDay')
    expect(time('An afternoon in a field')).toBe('noon')
    expect(time('Noon on the plain')).toBe('noon')
    expect(time('A village in the evening')).toBe('dusk')
    expect(time('A sunset over the sea')).toBe('dusk')
  })
  it('an AT time still wins, and a time named earlier still wins', () => {
    expect(time('A late afternoon market at dawn')).toBe('dawn')
    expect(time('Night falls; the late afternoon is forgotten')).toBe('night')
    expect(time('A low sun at noon')).toBe('noon')
  })
  it('weather stacks on it, it is not an interior, and a key light with no time words still reads dusk', () => {
    expect(skyLook(plan('Late afternoon under heavy fog')).weather).toBe('fog')
    expect(skyLook(plan(RUN1)).interior).toBe(false)
    expect(skyLook(plan('', { light: { keyDir: [140, 10] } })).time).toBe('dusk')
  })
})
