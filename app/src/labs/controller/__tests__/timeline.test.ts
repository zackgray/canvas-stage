import { describe, expect, it } from 'vitest'
import { advanceTimeline, togglePlay, type Timeline } from '../engine/timeline'

const tl = (o: Partial<Timeline> = {}): Timeline => ({ time: 0, playing: true, duration: 10, ...o })

describe('timeline: play, loop, once', () => {
  it('no loop: stops at the end, held there', () => {
    const t = tl({ time: 9.9 })
    advanceTimeline(t, 0.25)
    expect(t).toMatchObject({ time: 10, playing: false })
  })

  it('loop: wraps past the end keeping the overshoot, still playing', () => {
    const t = tl({ time: 9.9, loop: true })
    advanceTimeline(t, 0.25)
    expect(t.playing).toBe(true)
    expect(t.time).toBeCloseTo(0.15, 9)
  })

  it('loop: landing exactly on the end wraps to 0', () => {
    const t = tl({ time: 9.75, loop: true })
    advanceTimeline(t, 0.25)
    expect(t).toMatchObject({ time: 0, playing: true })
  })

  it('loop: many frames keep the time in [0, duration) and add up', () => {
    const t = tl({ loop: true })
    for (let i = 0; i < 24 * 25; i++) advanceTimeline(t, 1 / 24)
    expect(t.playing).toBe(true)
    expect(t.time).toBeGreaterThanOrEqual(0)
    expect(t.time).toBeLessThan(10)
    expect(t.time).toBeCloseTo(5, 6) // 25 s on a 10 s loop
  })

  it('once (a take): never wraps, even with loop on', () => {
    const t = tl({ time: 9.9, loop: true })
    advanceTimeline(t, 0.25, true)
    expect(t).toMatchObject({ time: 10, playing: false })
  })

  it('paused: nothing moves; a zero-length loop stops instead of spinning', () => {
    const p = tl({ time: 3, playing: false, loop: true })
    advanceTimeline(p, 1)
    expect(p.time).toBe(3)
    const z = tl({ duration: 0, loop: true })
    advanceTimeline(z, 0.1)
    expect(z).toMatchObject({ time: 0, playing: false })
  })

  it('play from the end starts over', () => {
    const t = tl({ time: 10, playing: false })
    togglePlay(t)
    expect(t).toMatchObject({ time: 0, playing: true })
    togglePlay(t)
    expect(t.playing).toBe(false)
  })
})
