// @vitest-environment jsdom
// A paid press queued behind another job is dropped when the page goes (nothing billed): the browser asks first, also for a press
// so new that the server's "waiting" has not been read back yet.
import { describe, expect, it } from 'vitest'
import { FRESH_PRESS_MS, jobsAtRisk } from '../leaveGuard'
import type { SceneJobRecord } from '../../shared/libraryContract'

const NOW = Date.parse('2026-10-27T12:00:00Z')
const job = (over: Partial<SceneJobRecord>): SceneJobRecord => ({ id: 'j', scene: 's', intent: 'l2r', target: 't', price: 58, route: '/x', status: 'running', startedAt: new Date(NOW - 60_000).toISOString(), ...over }) as SceneJobRecord

describe('leaving while a paid press is not started', () => {
  it('a queued press, or one only seconds old, warns; a settled running one and finished ones do not', () => {
    expect(jobsAtRisk([job({ waiting: true })], NOW)).toBe(true)
    expect(jobsAtRisk([job({ startedAt: new Date(NOW - FRESH_PRESS_MS + 1000).toISOString() })], NOW)).toBe(true)
    expect(jobsAtRisk([job({})], NOW)).toBe(false)
    expect(jobsAtRisk([job({ status: 'done', waiting: true })], NOW)).toBe(false)
    expect(jobsAtRisk([], NOW)).toBe(false)
  })
})
