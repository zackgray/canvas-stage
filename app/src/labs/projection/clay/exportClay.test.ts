import { describe, expect, it, vi } from 'vitest'
import type { ClayExport, TakeRecord } from '../../../shared/shotContract'
import type { Stage } from '../engine/Stage'
import { fakeTake } from './__fixtures__/take'
import { exportClay, performanceMismatch, worldMismatch, type ClayProgress } from './exportClay'
import { lockKey, lockRequest } from './plan'

const pack = { id: 'pack-a', fps: 24, frames: 400 }
const q = lockRequest(fakeTake(0.5), pack, 'loc-a', 1.5) // 9 frames
const rec = { ...q, id: 'take-a', startKey: lockKey(q).startKey, lockedAt: '', createdAt: '' } as TakeRecord
const clay = (over: Partial<ClayExport>): ClayExport => ({ takeId: 'take-a', startKey: rec.startKey, mp4: null, frames: 9, width: 1920, height: 1088, status: 'running', ...over })

function server(statuses: ClayExport[]) {
  const calls: { url: string; method: string; body: unknown }[] = []
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body })
    if (url.includes('/depth?')) return new Response('{"ok":true}', { status: 200 })
    if (url.endsWith('/finish')) return new Response(JSON.stringify({ clay: clay({ done: 0 }) }), { status: 202 })
    return new Response(JSON.stringify({ clay: statuses.shift() }), { status: 200 })
  })
  return { f: f as unknown as typeof fetch, calls }
}
const capture = vi.fn(async () => ({ colour: new Uint8Array([1, 2, 3]), depth: new Float32Array(4), bg: new Float32Array(4), holeShare: 0 }))
const stage = {} as Stage

describe('exportClay', () => {
  it('captures every frame, uploads its three passes, finishes with the cameras and follows the shading to done', async () => {
    const { f, calls } = server([clay({ done: 4 }), clay({ status: 'done', done: 9, mp4: '/lab-assets/shots/take-a/clay/clay.mp4' })])
    const seen: ClayProgress[] = []
    const out = await exportClay(stage, rec, pack, 'loc-a', (p) => seen.push(p), { fetch: f, capture, sleep: async () => {} })
    expect(out.status).toBe('done')
    expect(capture).toHaveBeenCalledTimes(9)
    const ups = calls.filter((c) => c.url.includes('/depth?'))
    expect(ups).toHaveLength(27)
    expect(ups.map((c) => new URL(c.url, 'http://x').searchParams.get('kind')).slice(0, 3).sort()).toEqual(['bg', 'colour', 'depth'])
    expect(ups.every((c) => new URL(c.url, 'http://x').searchParams.get('take') === 'take-a')).toBe(true)
    expect((ups[1].body as Uint8Array).byteLength).toBe(16) // a Float32 depth goes up as its raw bytes
    const fin = calls.find((c) => c.url.endsWith('/finish'))!
    const body = JSON.parse(fin.body as string)
    expect(body.takeId).toBe('take-a')
    expect(body.cameras).toHaveLength(9)
    expect(body.cameras[0]).toMatchObject({ i: 0, focal: 35 })
    expect(seen[0]).toEqual({ phase: 'capture', done: 0, total: 9 })
    expect(seen).toContainEqual({ phase: 'shade', done: 4, total: 9 })
    expect(seen.at(-1)).toEqual({ phase: 'shade', done: 9, total: 9 })
  })

  it('surfaces a failed upload and a failed shade', async () => {
    const bad = vi.fn(async (url: string) => (url.includes('/depth?') ? new Response('{"error":"body over"}', { status: 413 }) : new Response('{}')))
    await expect(exportClay(stage, rec, pack, 'loc-a', () => {}, { fetch: bad as unknown as typeof fetch, capture })).rejects.toThrow(/body over/)
    const { f } = server([clay({ status: 'failed', error: 'the clay script stopped (exit 1)' })])
    await expect(exportClay(stage, rec, pack, 'loc-a', () => {}, { fetch: f, capture, sleep: async () => {} })).rejects.toThrow(/exit 1/)
  })

  it('refuses when the performance on the set is not the locked one', async () => {
    expect(performanceMismatch(rec, null)).toMatch(/back on the set/)
    expect(performanceMismatch(rec, { id: 'pack-b' })).toMatch(/back on the set/)
    expect(performanceMismatch({ ...rec, packId: null }, pack)).toMatch(/no performance/)
    expect(performanceMismatch(rec, pack)).toBeNull()
    await expect(exportClay(stage, rec, null, 'loc-a', () => {}, { capture })).rejects.toThrow(/back on the set/)
  })

  it('refuses when the set shows another world than the take was locked on, before capturing anything (B3)', async () => {
    expect(worldMismatch(rec, 'loc-a')).toBeNull()
    expect(worldMismatch(rec, 'loc-b')).toMatch(/^This take was filmed on another set: switch back to the set it was filmed on, or lock a new take on this one.$/)
    const { f, calls } = server([])
    const cap = vi.fn(capture)
    await expect(exportClay(stage, rec, pack, 'loc-b', () => {}, { fetch: f, capture: cap })).rejects.toThrow(/filmed on another set/)
    expect(cap).not.toHaveBeenCalled(); expect(calls).toEqual([])
  })
})
