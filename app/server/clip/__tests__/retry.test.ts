import { describe, expect, it } from 'vitest'
import { freeHiccup, isCloudHiccup, MAX_ATTEMPTS, shouldRetry, type AttemptOutcome } from '../retry.ts'

// Cloud's job error as it arrived 13 times (credit-log.md, node 13, ~1.3 s, 0 credits).
const HICCUP = { class_type: 'VAELoader', code: 'node_execution_error', message: 'cannot unpack non-iterable MTPHead object\n', node_id: '13' }
const OOM = { class_type: 'LTXVBaseSampler', code: 'node_execution_error', message: 'CUDA out of memory', node_id: '9' }

describe('the hiccup signature and the free test (pure)', () => {
  const o = (x: Partial<AttemptOutcome>): AttemptOutcome => ({ status: 'failed', error: HICCUP, deltaCents: 0, execSeconds: 1.3, outputs: 0, ...x })
  it('matches the VAELoader / MTPHead error, as an object or its JSON text, and nothing else', () => {
    expect(isCloudHiccup(HICCUP)).toBe(true)
    expect(isCloudHiccup(JSON.stringify(HICCUP))).toBe(true)
    expect(isCloudHiccup(OOM)).toBe(false)
    expect(isCloudHiccup({ ...HICCUP, class_type: 'CheckpointLoaderSimple' })).toBe(false)
    expect(isCloudHiccup({ ...HICCUP, message: 'file not found' })).toBe(false)
    expect(isCloudHiccup('cannot unpack non-iterable MTPHead object')).toBe(false)
    expect(isCloudHiccup(null)).toBe(false)
  })
  it('free = failed + signature + settled cost 0; with no balance, < 3 s and no outputs', () => {
    expect(freeHiccup(o({}))).toBe(true)
    expect(freeHiccup(o({ deltaCents: 0.5 }))).toBe(false)
    expect(freeHiccup(o({ deltaCents: -3 }))).toBe(false)
    expect(freeHiccup(o({ status: 'wait-error' }))).toBe(false)
    expect(freeHiccup(o({ error: OOM }))).toBe(false)
    expect(freeHiccup(o({ deltaCents: null }))).toBe(true)
    expect(freeHiccup(o({ deltaCents: null, execSeconds: 3.2 }))).toBe(false)
    expect(freeHiccup(o({ deltaCents: null, execSeconds: null }))).toBe(false)
    expect(freeHiccup(o({ deltaCents: null, outputs: 1 }))).toBe(false)
    // a settled 0 is trusted over a slow run
    expect(freeHiccup(o({ execSeconds: 9 }))).toBe(true)
  })
  it('at most MAX_ATTEMPTS = 3 submissions', () => {
    expect(MAX_ATTEMPTS).toBe(3)
    expect([1, 2, 3].map((a) => shouldRetry(o({}), a))).toEqual([true, true, false])
  })
})

