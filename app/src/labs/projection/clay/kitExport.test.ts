// Kit clay export (wave 2): a take on a kit world uploads ONE finished frame per frame (kind 'final'), nothing for the Python
// shading, finishes and follows the encode; the panorama path is untouched (exportClay.test.ts). The capture renderer is set to
// the E114 spike's look, and its read-back is flipped into PNG order.
import { ACESFilmicToneMapping, PCFShadowMap, SRGBColorSpace } from 'three'
import { describe, expect, it, vi } from 'vitest'
import type { ClayExport, TakeRecord } from '../../../shared/shotContract'
import type { Stage } from '../engine/Stage'
import { fakeTake } from './__fixtures__/take'
import { exportClay, type ClayProgress } from './exportClay'
import { applyKitLook, KIT_LOOK, rgbaBottomUpToRgb, type KitFrameCapture } from './kitCapture'
import { CLAY_MAX, lockKey, lockRequest } from './plan'

const pack = { id: 'mocap-0000beef', fps: 24, frames: 400 }
const q = lockRequest(fakeTake(0.5), pack, 'loc-k', 16 / 9) // 9 frames
const rec = { ...q, id: 'take-k', startKey: lockKey(q).startKey, lockedAt: '', createdAt: '' } as TakeRecord
const clay = (over: Partial<ClayExport>): ClayExport => ({ takeId: 'take-k', startKey: rec.startKey, mp4: null, frames: 9, width: 1920, height: 1088, status: 'running', method: 'browser', ...over })
const kitStage = { kit: { worldId: 'loc-k' } } as unknown as Stage

function server(statuses: ClayExport[]) {
  const calls: { url: string; body: unknown }[] = []
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body })
    if (url.includes('/depth?')) return new Response('{"ok":true}', { status: 200 })
    if (url.endsWith('/finish')) return new Response(JSON.stringify({ clay: clay({ done: 0 }) }), { status: 202 })
    return new Response(JSON.stringify({ clay: statuses.shift() }), { status: 200 })
  })
  return { f: f as unknown as typeof fetch, calls }
}
function fakeCapture() {
  const disposed = vi.fn()
  const frame = vi.fn(async () => new Uint8Array([137, 80, 78, 71]))
  return { cap: { frame, dispose: disposed } satisfies KitFrameCapture, frame, disposed }
}

describe('kit clay export', () => {
  it('renders every frame once, uploads it as a final frame, finishes and follows the encode to done', async () => {
    const { f, calls } = server([clay({ done: 5 }), clay({ status: 'done', done: 9, mp4: '/lab-assets/shots/take-k/clay/clay.mp4' })])
    const { cap, frame, disposed } = fakeCapture()
    const pano = vi.fn()
    const seen: ClayProgress[] = []
    const out = await exportClay(kitStage, rec, pack, 'loc-k', (p) => seen.push(p), { fetch: f, kitCapture: () => cap, capture: pano, sleep: async () => {} })
    expect(out.status).toBe('done')
    expect(pano).not.toHaveBeenCalled() // no colour / depth / bg passes on a kit world
    expect(frame).toHaveBeenCalledTimes(9)
    expect(disposed).toHaveBeenCalledTimes(1)
    const ups = calls.filter((c) => c.url.includes('/depth?')).map((c) => new URL(c.url, 'http://x').searchParams)
    expect(ups.map((p) => p.get('kind'))).toEqual(Array(9).fill('final'))
    expect(ups.map((p) => p.get('frame'))).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8'])
    expect(JSON.parse(calls.find((c) => c.url.endsWith('/finish'))!.body as string).cameras).toHaveLength(9)
    expect(seen).toContainEqual({ phase: 'encode', done: 5, total: 9 })
    expect(seen.at(-1)).toEqual({ phase: 'encode', done: 9, total: 9 })
  })

  it('surfaces a failed upload and a failed encode, and always frees the capture renderer', async () => {
    const bad = vi.fn(async (url: string) => (url.includes('/depth?') ? new Response('{"error":"empty final pass"}', { status: 400 }) : new Response('{}')))
    const a = fakeCapture()
    await expect(exportClay(kitStage, rec, pack, 'loc-k', () => {}, { fetch: bad as unknown as typeof fetch, kitCapture: () => a.cap })).rejects.toThrow(/empty final pass/)
    expect(a.disposed).toHaveBeenCalledTimes(1)
    const { f } = server([clay({ status: 'failed', error: 'the clay video holds 120 frames, the take 121' })])
    const b = fakeCapture()
    await expect(exportClay(kitStage, rec, pack, 'loc-k', () => {}, { fetch: f, kitCapture: () => b.cap, sleep: async () => {} })).rejects.toThrow(/holds 120 frames/)
  })

  it('a long walk still locks a take of at most 161 frames (the cap is kept, not refused)', () => {
    const long = lockRequest(fakeTake(12), { id: 'mocap-1', fps: 24, frames: 24 * 14 }, 'loc-k', 16 / 9)
    expect(long.frames).toBe(CLAY_MAX)
  })
})

describe('the capture renderer', () => {
  it('is set to the spike\'s look: ACES Filmic at exposure 1, PCF shadows, sRGB out, pixel ratio 1, 1920x1088', () => {
    const r = { setPixelRatio: vi.fn(), setSize: vi.fn(), shadowMap: { enabled: false, type: 0 }, toneMapping: 0, toneMappingExposure: 0, outputColorSpace: '' }
    applyKitLook(r as never)
    expect(r.setPixelRatio).toHaveBeenCalledWith(1)
    expect(r.setSize).toHaveBeenCalledWith(1920, 1088, false)
    expect(r.shadowMap).toEqual({ enabled: true, type: PCFShadowMap })
    expect([r.toneMapping, r.toneMappingExposure, r.outputColorSpace]).toEqual([ACESFilmicToneMapping, 1, SRGBColorSpace])
    expect(KIT_LOOK.exposure).toBe(1)
  })
  it('flips the bottom-up RGBA read-back into top-down RGB', () => {
    const px = new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255, /* top row: */ 7, 8, 9, 255, 10, 11, 12, 255])
    expect([...rgbaBottomUpToRgb(px, 2, 2)]).toEqual([7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6])
  })
})
