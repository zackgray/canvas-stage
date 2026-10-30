// Per-take performance (WP3): a clay is captured with one performer from its first frame to its finish. A walk switched or a
// figure rebuilt mid-capture stops the export before anything is finished, and the finish names the performer captured (packId).
import { describe, expect, it, vi } from 'vitest'
import type { ClayExport, TakeRecord } from '../../../shared/shotContract'
import type { Stage } from '../engine/Stage'
import { fakeTake } from './__fixtures__/take'
import { exportClay } from './exportClay'
import type { KitFrameCapture } from './kitCapture'
import { PERFORMER_CHANGED } from './layerGuard'
import { lockKey, lockRequest } from './plan'

const pack = { id: 'mocap-0000beef', fps: 24, frames: 400 }
const q = lockRequest(fakeTake(0.5), pack, 'loc-k', 16 / 9) // 9 frames
const rec = { ...q, id: 'take-k', startKey: lockKey(q).startKey, lockedAt: '', createdAt: '' } as TakeRecord
const clay = (over: Partial<ClayExport>): ClayExport => ({ takeId: 'take-k', startKey: rec.startKey, mp4: null, frames: 9, width: 1920, height: 1088, status: 'running', method: 'browser', ...over })

function server() {
  const calls: { url: string; body: unknown }[] = []
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body })
    if (url.includes('/depth?')) return new Response('{"ok":true}', { status: 200 })
    if (url.endsWith('/finish')) return new Response(JSON.stringify({ clay: clay({ done: 0 }) }), { status: 202 })
    return new Response(JSON.stringify({ clay: clay({ status: 'done', done: 9, mp4: '/x.mp4' }) }), { status: 200 })
  })
  return { f: f as unknown as typeof fetch, calls }
}
const layer = (id: string) => ({ pack: { id } })

function kitStage(id = pack.id) {
  const world = { performance: layer(id) as { pack: { id: string } } | null }
  return { stage: { kit: { worldId: 'loc-k' }, world } as unknown as Stage, world }
}

describe('the clay export holds one performer', () => {
  it('stops when the stage\'s performer changes mid-capture: nothing is finished', async () => {
    const { stage, world } = kitStage()
    const { f, calls } = server()
    let n = 0
    // the third frame's draw: the walk on the set is switched (a take picked, a figure rebuilt)
    const frame = vi.fn(async () => { if (++n === 3) world.performance = layer(pack.id); return new Uint8Array([137, 80, 78, 71]) })
    const cap = { frame, dispose: vi.fn() } satisfies KitFrameCapture
    await expect(exportClay(stage, rec, pack, 'loc-k', () => {}, { fetch: f, kitCapture: () => cap, sleep: async () => {} })).rejects.toThrow(PERFORMER_CHANGED)
    expect(frame.mock.calls.length).toBeLessThan(9)
    expect(calls.some((c) => c.url.endsWith('/finish'))).toBe(false)
    expect(cap.dispose).toHaveBeenCalledTimes(1)
  })

  it('stops before the first frame when the stage plays another walk than the take\'s', async () => {
    const { stage } = kitStage('mocap-other')
    const { f, calls } = server()
    const cap = { frame: vi.fn(async () => new Uint8Array([1])), dispose: vi.fn() } satisfies KitFrameCapture
    await expect(exportClay(stage, rec, pack, 'loc-k', () => {}, { fetch: f, kitCapture: () => cap, sleep: async () => {} })).rejects.toThrow(PERFORMER_CHANGED)
    expect(cap.frame).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  it('names the performer captured on the finish (the server\'s stamp)', async () => {
    const { stage } = kitStage()
    const { f, calls } = server()
    const cap = { frame: vi.fn(async () => new Uint8Array([1])), dispose: vi.fn() } satisfies KitFrameCapture
    await exportClay(stage, rec, pack, 'loc-k', () => {}, { fetch: f, kitCapture: () => cap, sleep: async () => {} })
    const fin = calls.find((c) => c.url.endsWith('/finish'))!
    expect(JSON.parse(fin.body as string).packId).toBe(pack.id)
  })

  it('holds on the panorama path too', async () => {
    const world = { performance: layer('pack-a') as { pack: { id: string } } | null }
    const stage = { world } as unknown as Stage
    const panoRec = { ...rec, packId: 'pack-a' }
    const { f, calls } = server()
    let n = 0
    const capture = vi.fn(async () => {
      if (++n === 2) world.performance = null
      return { colour: new Uint8Array([1]), depth: new Float32Array(1), bg: new Float32Array(1), holeShare: 0 }
    })
    await expect(exportClay(stage, panoRec, { ...pack, id: 'pack-a' }, 'loc-k', () => {}, { fetch: f, capture, sleep: async () => {} })).rejects.toThrow(PERFORMER_CHANGED)
    expect(calls.some((c) => c.url.endsWith('/finish'))).toBe(false)
  })
})
