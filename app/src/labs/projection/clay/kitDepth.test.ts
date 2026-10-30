// The kit clay's metric depth: read-back planar metres -> 16-bit centimetre PNGs (top row first), one per frame, uploaded beside
// the finished frame (kind 'zdepth') at the clay's size; the cameras sent carry no focus.
import { describe, expect, it, vi } from 'vitest'
import type { ClayExport, TakeRecord } from '../../../shared/shotContract'
import type { Stage } from '../engine/Stage'
import { decodePng } from '../math/png'
import { fakeTake } from './__fixtures__/take'
import { exportClay } from './exportClay'
import type { KitFrameCapture } from './kitCapture'
import { encodeDepthPng, metresToUnits } from './kitDepth'
import { CLAY_H, CLAY_W, lockKey, lockRequest } from './plan'

describe('metresToUnits', () => {
  it('centimetres, flipped top row first; nothing drawn = 0; at least 1; capped at 65535', () => {
    // 2x2 RGBA, bottom row first: bottom = [0 (none), 0.004 m], top = [12.345 m, 900 m]
    const px = new Float32Array([0, 0, 0, 1, 0.004, 0, 0, 1, 12.345, 0, 0, 1, 900, 0, 0, 1])
    expect([...metresToUnits(px, 2, 2)]).toEqual([1235, 65535, 0, 1])
  })
})

const pack = { id: 'mocap-0000beef', fps: 24, frames: 400 }
const take = fakeTake(0.5)
const q = lockRequest(take, pack, 'loc-k', 16 / 9) // 9 frames
const rec = { ...q, id: 'take-k', startKey: lockKey(q).startKey, lockedAt: '', createdAt: '' } as TakeRecord
const kitStage = { kit: { worldId: 'loc-k' } } as unknown as Stage

describe('kit clay export with depth', () => {
  it('uploads one 1920x1088 16-bit zdepth PNG per frame after its final frame, and sends each frame\'s focus', async () => {
    const calls: { url: string; body: unknown }[] = []
    const done: ClayExport = { takeId: 'take-k', startKey: rec.startKey, mp4: '/x/clay.mp4', frames: 9, width: 1920, height: 1088, status: 'done', method: 'browser' }
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body })
      if (url.includes('/depth?')) return new Response('{"ok":true}')
      return new Response(JSON.stringify({ clay: done }), { status: url.endsWith('/finish') ? 202 : 200 })
    }) as unknown as typeof fetch
    const z = await encodeDepthPng(new Uint16Array(CLAY_W * CLAY_H).fill(1000))
    const cap: KitFrameCapture = { frame: vi.fn(async () => new Uint8Array([137, 80, 78, 71])), depth: vi.fn(async () => z), dispose: vi.fn() }
    await exportClay(kitStage, rec, pack, 'loc-k', () => {}, { fetch: f, kitCapture: () => cap, sleep: async () => {} })
    const ups = calls.filter((c) => c.url.includes('/depth?')).map((c) => ({ p: new URL(c.url, 'http://x').searchParams, body: c.body as Uint8Array }))
    // frames upload behind the draw, a few at once: every frame's final and zdepth once, each frame's final before its zdepth
    const order = ups.map((u) => `${u.p.get('kind')}:${u.p.get('frame')}`)
    expect([...order].sort()).toEqual(Array.from({ length: 9 }, (_, i) => [`final:${i}`, `zdepth:${i}`]).flat().sort())
    for (let i = 0; i < 9; i++) expect(order.indexOf(`final:${i}`)).toBeLessThan(order.indexOf(`zdepth:${i}`))
    const depth = ups.filter((u) => u.p.get('kind') === 'zdepth')
    expect(depth).toHaveLength(rec.frames)
    const img = await decodePng(depth[0].body)
    expect([img.width, img.height, img.channels, img.bitDepth]).toEqual([1920, 1088, 1, 16])
    expect(img.data[0]).toBe(1000) // 10 m at 1 cm per unit
    const cams = JSON.parse(calls.find((c) => c.url.endsWith('/finish'))!.body as string).cameras as { focus?: number }[]
    expect(cams).toHaveLength(9)
    expect(cams.every((c) => c.focus === undefined)).toBe(true)
  })
})
