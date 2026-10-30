// The Render screen's one primary button: the Layout-To-Render pass, its free finish, then Export.
import { describe, expect, it, vi } from 'vitest'
import type { L2RFacts } from '../render/l2rModel'
import { KIT_NEEDS_FRAMES, KIT_NEEDS_TAKE, L2R_NEEDS_STILL, primaryFor, type PrimaryL2R } from './primaryAction'
import { L2R_UNKNOWN_TAG } from '../render/l2rModel'

const chain = (f: Partial<L2RFacts>, extra: Record<string, unknown> = {}) => {
  const spies = { render: vi.fn(async () => null), finish: vi.fn(async () => null) }
  const l = { facts: { take: true, clay: true, still: true, prompt: true, rendered: false, finished: false, running: false, again: false, ...f },
    price: 21, configured: true, current: { id: 'l2r-1' }, finishingNow: false, state: { working: false }, ...spies, ...extra } as unknown as PrimaryL2R
  return { l, spies }
}

describe('primary on the Layout-To-Render path', () => {
  it('is "Render ≈21 cr" and runs one render', () => {
    const { l, spies } = chain({})
    const p = primaryFor(l)
    expect(p).toMatchObject({ action: 'l2r', verb: 'Render', price: 21, disabled: false, why: null })
    p.run(); expect(spies.render).toHaveBeenCalledTimes(1)
  })
  it('needs an approved still first', () => {
    expect(primaryFor(chain({ still: false }).l)).toMatchObject({ action: 'needs-still', disabled: true, why: L2R_NEEDS_STILL })
  })
  it('M1: is off while the scene prompt names an unknown tag and no override is written', () => {
    expect(primaryFor(chain({ prompt: false }).l)).toMatchObject({ action: 'l2r', disabled: true, why: L2R_UNKNOWN_TAG })
  })
  it('is off while a render runs, without a Comfy target, and with no price', () => {
    expect(primaryFor(chain({ running: true }).l)).toMatchObject({ disabled: true, why: 'A render is running.' })
    expect(primaryFor(chain({}, { configured: false }).l).disabled).toBe(true)
    expect(primaryFor(chain({}, { price: null }).l).disabled).toBe(true)
  })
  it('then Finish (free) on the render on show, then Export', () => {
    const { l, spies } = chain({ rendered: true })
    const p = primaryFor(l)
    expect(p).toMatchObject({ action: 'l2r-finish', verb: 'Finish', price: 0, disabled: false })
    p.run(); expect(spies.finish).toHaveBeenCalledWith('l2r-1')
    expect(primaryFor(chain({ rendered: true, finished: true }).l)).toMatchObject({ action: 'export', price: null })
  })
  it('after a done render, a changed seed / prompt / still makes the primary the paid "Render again" (B2)', () => {
    const { l, spies } = chain({ rendered: true, finished: true, again: true })
    const p = primaryFor(l)
    expect(p).toMatchObject({ action: 'l2r', verb: 'Render again', price: 21, disabled: false })
    p.run(); expect(spies.render).toHaveBeenCalledTimes(1)
  })
})

describe('with nothing to render there is never a paid button (QA 2026-10-25, money)', () => {
  it('with no locked take: a disabled, priceless Render that says to lock a take, and it runs nothing', () => {
    const { l, spies } = chain({ take: false, clay: false, still: false })
    const p = primaryFor(l)
    expect(p).toMatchObject({ action: 'needs-take', verb: 'Render', price: null, disabled: true, why: KIT_NEEDS_TAKE })
    p.run(); expect(spies.render).not.toHaveBeenCalled()
  })
  it('with a take but no prepared frames: says to prepare them', () => {
    expect(primaryFor(chain({ take: true, clay: false }).l)).toMatchObject({ verb: 'Render', price: null, disabled: true, why: KIT_NEEDS_FRAMES })
  })
})
