import { describe, expect, it } from 'vitest'
import { l2rEstimate, seedCredits } from '../price.ts'

// the app's billed L2R takes (credit log, 2026-10-23..24): [frames, keyed, low cr, high cr]
const MEASURED: [number, boolean, number, number][] = [[41, false, 16, 16], [49, false, 17, 18], [49, true, 17, 18], [57, false, 19, 19], [97, false, 20, 27], [145, false, 21, 28], [193, false, 57, 57]]

describe('Layout-To-Render price', () => {
  it('never reads below what Cloud billed for any measured take', () => {
    for (const [f, keyed, , hi] of MEASURED) expect(l2rEstimate(f, [], keyed).credits, `${f} f keyed=${keyed}`).toBeGreaterThanOrEqual(hi)
  })
  it('the 193-frame studio render shows the billed price, not 41', () => {
    expect(l2rEstimate(193).credits).toBeGreaterThanOrEqual(57)
  })
  it('stays close to the data: no more than ~35% over the dearest measured take', () => {
    for (const [f, keyed, , hi] of MEASURED) expect(l2rEstimate(f, [], keyed).credits).toBeLessThanOrEqual(Math.ceil(hi * 1.35))
  })
  it('rounds up to a whole credit and grows with frames', () => {
    expect(Number.isInteger(l2rEstimate(137).credits)).toBe(true)
    expect(seedCredits(100)).toBeGreaterThan(seedCredits(97))
    expect(l2rEstimate(145).credits).toBeGreaterThan(l2rEstimate(105).credits)
    expect(l2rEstimate(289).credits).toBeGreaterThan(l2rEstimate(193).credits)
  })
  it("learns from the app's own renders upward to 1.5x, never down under the anchors", () => {
    expect(l2rEstimate(97, [{ frames: 97, credits: 36 }]).credits).toBeGreaterThan(l2rEstimate(97).credits)
    expect(l2rEstimate(97, [{ frames: 97, credits: 1000 }]).credits).toBe(Math.ceil(seedCredits(97) * 1.5))
    expect(l2rEstimate(97, [{ frames: 97, credits: 1 }]).credits).toBe(l2rEstimate(97).credits)
  })
  it('a keyframed render is not mistaken for a dearer base rate', () => {
    expect(l2rEstimate(49, [{ frames: 49, credits: 18, keyed: true }]).credits).toBe(l2rEstimate(49).credits)
  })
})
