import { describe, expect, it } from 'vitest'
import { isRealismId, REALISM_ID_RE, REALISM_MP4_RE } from '../ids.ts'

describe('realism ids (imported by Finish and Cut)', () => {
  it('matches realism-<stamp> with a clash suffix and nothing else', () => {
    for (const ok of ['realism-2026-10-21T14-02-33-123', 'realism-2026-10-21T14-02-33-123-2']) expect(isRealismId(ok)).toBe(true)
    for (const bad of ['realism-2026-10-21T14-02-33', 'reskin-2026-10-21T14-02-33-123', 'realism-2026-10-21T14-02-33-123.mp4', 'xrealism-2026-10-21T14-02-33-123', 'realism-2026-10-21T14-02-33-123-1920']) expect(isRealismId(bad)).toBe(false)
    expect(REALISM_ID_RE.exec('realism-2026-10-21T14-02-33-123')?.[1]).toBe('2026-10-21T14-02-33-123')
  })
  it('the mp4 matcher is exact: a dot is a dot, siblings do not match', () => {
    expect(REALISM_MP4_RE.exec('realism-2026-10-21T14-02-33-123.mp4')?.[1]).toBe('realism-2026-10-21T14-02-33-123')
    for (const bad of ['realism-2026-10-21T14-02-33-123xmp4', 'realism-2026-10-21T14-02-33-123-c1.mp4', 'realism-2026-10-21T14-02-33-123.json']) expect(REALISM_MP4_RE.test(bad)).toBe(false)
  })
})
