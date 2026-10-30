import { describe, expect, it } from 'vitest'
import { listPerformances, TAKE_ID } from '../takes.ts'
import { PACK, rig } from './rig.ts'

describe('listPerformances', () => {
  it('lists drafts, finals and finished per performance with the camera move start; skips non-takes and pack-less moves', async () => {
    const { renders, probe } = rig()
    const perfs = await listPerformances(renders, probe)
    expect(perfs.map((p) => p.packId).sort()).toEqual(['other', PACK])
    const takes = perfs.find((p) => p.packId === PACK)!.takes
    expect(takes.map((t) => [t.kind, t.sourceStart, t.width])).toEqual([['draft', 0, 960], ['final', 0, 1920], ['draft', 12, 960], ['finished', 12, 1920]])
    expect(takes.find((t) => t.kind === 'finished')).toMatchObject({ id: 'warp-2026-10-19T11-00-00/finished-src1-2026-10-19T11-40-00-000', hasAudio: false, stamp: 'src1-2026-10-19T11-40-00-000' })
    expect(takes.every((t) => TAKE_ID.test(t.id))).toBe(true)
  })

  it('an unreadable render is not a take', async () => {
    const { renders } = rig()
    expect(await listPerformances(renders, async () => null)).toEqual([])
  })
})
