// Kit clay export with the ID pass: uploaded at the keyframes only, the colour table rides on the finish, none without entities.
import { describe, expect, it, vi } from 'vitest'
import type { ClayExport, TakeRecord } from '../../../shared/shotContract'
import type { Stage } from '../engine/Stage'
import { fakeTake } from './__fixtures__/take'
import { exportKitClay, idKeyframes } from './kitExport'
import type { KitFrameCapture } from './kitCapture'
import { lockKey, lockRequest } from './plan'

const pack = { id: 'mocap-0000beef', fps: 24, frames: 400 }
const q = lockRequest(fakeTake(0.5), pack, 'loc-k', 16 / 9) // 9 frames
const rec = { ...q, id: 'take-k', startKey: lockKey(q).startKey, lockedAt: '', createdAt: '' } as TakeRecord
const done: ClayExport = { takeId: 'take-k', startKey: rec.startKey, mp4: 'x', frames: 9, width: 1920, height: 1088, status: 'done', method: 'browser' }

async function run(colors: Record<string, [number, number, number]>) {
  const urls: string[] = []
  let finish: { idColors?: unknown } = {}
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/depth?')) { urls.push(url); return new Response('{}') }
    if (url.endsWith('/finish')) finish = JSON.parse(init!.body as string)
    return new Response(JSON.stringify({ clay: done }), { status: 200 })
  }) as unknown as typeof fetch
  const idFrame = vi.fn(async () => ({ png: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]), colors }))
  const cap: KitFrameCapture = { frame: async () => new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]), idFrame, dispose: () => {} }
  await exportKitClay({} as Stage, rec, pack, () => {}, { fetch: f, kitCapture: () => cap, sleep: async () => {} })
  const ids = urls.map((u) => new URL(u, 'http://x').searchParams).filter((p) => p.get('kind') === 'id').map((p) => Number(p.get('frame')))
  return { ids, idFrame, finish }
}

describe('kit clay ID pass export', () => {
  it('picks the first, the 8-grid middle and the last frame (the frames keyframe stills are drawn on)', () => { expect(idKeyframes(97)).toEqual([0, 48, 96]); expect(idKeyframes(105)).toEqual([0, 48, 104]); expect(idKeyframes(9)).toEqual([0, 8]); expect(idKeyframes(1)).toEqual([0]) })
  it('renders and uploads the ID pass at the keyframes only and sends the colour table', async () => {
    const r = await run({ hero: [255, 0, 0] })
    expect(r.idFrame).toHaveBeenCalledTimes(2) // 9 frames: the 8-grid mid is the last frame
    expect(r.ids).toEqual([0, 8])
    expect(r.finish.idColors).toEqual({ hero: [255, 0, 0] })
  })
  it('uploads nothing and sends no table when the scene has no entities (the clay still finishes)', async () => {
    const r = await run({})
    expect(r.ids).toEqual([])
    expect(r.finish.idColors).toBeUndefined()
  })
})
