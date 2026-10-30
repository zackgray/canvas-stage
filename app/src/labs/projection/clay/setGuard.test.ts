// Per-take set (S3, Risk 1): a clay is captured on one set from its first frame to its finish. A set switched, edited or rebuilt
// mid-capture stops the export before anything is finished; a take holding its own set must be on it from the start; the finish
// names the set captured (setKey, S2's stamp).
import { describe, expect, it, vi } from 'vitest'
import type { ClayExport, TakeRecord } from '../../../shared/shotContract'
import type { ScenePlan } from '../../../stage3d/contract'
import { setKeyOf } from '../../../studio/shoot/setKey'
import type { Stage } from '../engine/Stage'
import { fakeTake } from './__fixtures__/take'
import { exportClay } from './exportClay'
import type { KitFrameCapture } from './kitCapture'
import { SET_CHANGED } from './layerGuard'
import { lockKey, lockRequest } from './plan'

const pack = { id: 'mocap-0000beef', fps: 24, frames: 400 }
const SET = { kit: [{ kind: 'crate', at: [1, -4] }] } as unknown as ScenePlan
const MOVED = { kit: [{ kind: 'crate', at: [3, -4] }] } as unknown as ScenePlan
const q = lockRequest(fakeTake(0.5), pack, 'loc-k', 16 / 9) // 9 frames
const rec = { ...q, id: 'take-k', startKey: lockKey(q).startKey, lockedAt: '', createdAt: '', setKey: setKeyOf(SET)!, set: SET } as TakeRecord
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
function kitStage(plan: ScenePlan) {
  const kit = { worldId: 'loc-k', plan }
  const stage = { kit, world: { performance: { pack: { id: pack.id } } } } as unknown as Stage & { kit: { plan: ScenePlan } }
  return stage
}
const cap = (frame: () => Promise<Uint8Array>) => ({ frame: vi.fn(frame), dispose: vi.fn() }) satisfies KitFrameCapture
const deps = (f: typeof fetch, c: KitFrameCapture) => ({ fetch: f, kitCapture: () => c, sleep: async () => {} })

describe('the clay export holds one set', () => {
  it('stops when the set on the stage changes mid-capture (a piece moved in place): nothing is finished', async () => {
    const stage = kitStage(SET)
    const { f, calls } = server()
    let n = 0
    const c = cap(async () => { if (++n === 3) stage.kit.plan = MOVED; return new Uint8Array([1]) })
    await expect(exportClay(stage, rec, pack, 'loc-k', () => {}, deps(f, c))).rejects.toThrow(SET_CHANGED)
    expect(c.frame.mock.calls.length).toBeLessThan(9)
    expect(calls.some((x) => x.url.endsWith('/finish'))).toBe(false)
  })

  it('stops when the world is rebuilt mid-capture, even on an equal plan', async () => {
    const stage = kitStage(SET)
    const { f, calls } = server()
    let n = 0
    const c = cap(async () => { if (++n === 2) (stage as unknown as { kit: unknown }).kit = { worldId: 'loc-k', plan: { ...SET } }; return new Uint8Array([1]) })
    await expect(exportClay(stage, rec, pack, 'loc-k', () => {}, deps(f, c))).rejects.toThrow(SET_CHANGED)
    expect(calls.some((x) => x.url.endsWith('/finish'))).toBe(false)
  })

  it('stops before the first frame when a take holding its own set is not on it', async () => {
    const stage = kitStage(MOVED)
    const { f, calls } = server()
    const c = cap(async () => new Uint8Array([1]))
    await expect(exportClay(stage, rec, pack, 'loc-k', () => {}, deps(f, c))).rejects.toThrow(SET_CHANGED)
    expect(c.frame).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  it('names the set captured on the finish; a take with no copy is prepared on the set that stands, and names it', async () => {
    for (const [r, plan] of [[rec, SET], [{ ...rec, set: undefined }, MOVED]] as const) {
      const { f, calls } = server()
      await exportClay(kitStage(plan), r, pack, 'loc-k', () => {}, deps(f, cap(async () => new Uint8Array([1]))))
      const fin = calls.find((x) => x.url.endsWith('/finish'))!
      expect(JSON.parse(fin.body as string).setKey).toBe(setKeyOf(plan))
    }
  })
})
