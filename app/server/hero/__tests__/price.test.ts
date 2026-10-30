import { describe, expect, it } from 'vitest'
import { kitFinishCredits, kitStillCredits } from '../kitSpec.ts'
import { heroCredits } from '../spec.ts'

describe('still prices read at or above what the ledger billed', () => {
  it('hero stills: 1 seed billed 3, 2 seeds billed 4, 6 seeds about 8', () => {
    expect(heroCredits(1)).toBeGreaterThanOrEqual(3)
    expect(heroCredits(2)).toBeGreaterThanOrEqual(4)
    expect(heroCredits(6)).toBeGreaterThanOrEqual(8)
    expect(heroCredits(6)).toBeLessThanOrEqual(10)
  })
  it('kit still (depth-locked Qwen draw + Klein finish): billed 17, 15.5 in the first checks and 18, 19, 19 in the QA re-run', () => {
    expect(kitStillCredits(1)).toBeGreaterThanOrEqual(19)
    expect(kitStillCredits(1)).toBeLessThanOrEqual(22)
    expect(kitStillCredits(3)).toBeGreaterThanOrEqual(18 + 19 + 19) // the three stills of that run
  })
  it('a lone Klein finish billed 3', () => {
    expect(kitFinishCredits(1)).toBeGreaterThanOrEqual(3)
  })
})
