// (tidy wave) The kit clay export is a pipeline: the next frame is drawn while earlier frames still encode and upload, at most
// IN_FLIGHT behind; the capture's phase timing and the export's own ride on the finish body; and a massing failure the server
// reports after the encode is warned, never thrown.
import { describe, expect, it, vi } from 'vitest'
import type { ClayExport, TakeRecord } from '../../../shared/shotContract'
import type { Stage } from '../engine/Stage'
import { fakeTake } from './__fixtures__/take'
import { exportClay } from './exportClay'
import type { KitFrameCapture } from './kitCapture'
import { IN_FLIGHT } from './kitExport'
import { lockKey, lockRequest } from './plan'

const pack = { id: 'mocap-0000beef', fps: 24, frames: 400 }
const q = lockRequest(fakeTake(0.5), pack, 'loc-k', 16 / 9) // 9 frames
const rec = { ...q, id: 'take-k', startKey: lockKey(q).startKey, lockedAt: '', createdAt: '' } as TakeRecord
const kitStage = { kit: { worldId: 'loc-k' } } as unknown as Stage
const PNG = new Uint8Array([137, 80, 78, 71])

function server(done: Partial<ClayExport> = {}) {
  const finish: Record<string, unknown>[] = []
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/finish')) finish.push(JSON.parse(init!.body as string) as Record<string, unknown>)
    if (url.includes('/depth?')) return new Response('{"ok":true}')
    const clay: ClayExport = { takeId: 'take-k', startKey: rec.startKey, mp4: '/x/clay.mp4', frames: 9, width: 1920, height: 1088, status: 'done', method: 'browser', ...done }
    return new Response(JSON.stringify({ clay }), { status: url.endsWith('/finish') ? 202 : 200 })
  })
  return { f: f as unknown as typeof fetch, finish }
}

/** a capture whose encodes finish only when the test lets them */
function slowCapture() {
  const encodes: (() => void)[] = []
  let drawn = 0
  const cap: KitFrameCapture = {
    frame: async () => PNG,
    grab: () => { drawn++; return { png: new Promise<Uint8Array>((r) => encodes.push(() => r(PNG))), z: null } },
    timing: () => ({ renderMs: 5, readbackMs: 7, depthReadbackMs: 3, encodeMs: 11, encodeOn: 'worker' }),
    dispose: vi.fn(),
  }
  return { cap, encodes, drawn: () => drawn }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('the kit clay pipeline', () => {
  it('draws ahead of the encodes, but never more than IN_FLIGHT frames ahead', async () => {
    const { f } = server()
    const s = slowCapture()
    const run = exportClay(kitStage, rec, pack, 'loc-k', () => {}, { fetch: f, kitCapture: () => s.cap, sleep: async () => {} })
    await tick()
    expect(s.drawn()).toBe(IN_FLIGHT + 1) // none encoded yet, the draw is held at the limit
    s.encodes.shift()!()
    await tick()
    expect(s.drawn()).toBe(IN_FLIGHT + 2)
    while (s.drawn() < 9 || s.encodes.length) { s.encodes.shift()?.(); await tick() }
    expect((await run).status).toBe('done')
  })

  it('sends the capture\'s phases and its own (uploads, waits, wall time) on the finish', async () => {
    const { f, finish } = server()
    const s = slowCapture()
    const run = exportClay(kitStage, rec, pack, 'loc-k', () => {}, { fetch: f, kitCapture: () => s.cap, sleep: async () => {} })
    while (!finish.length) { s.encodes.shift()?.(); await tick() }
    await run
    expect(finish[0].timing).toMatchObject({ frames: 9, massingFrames: 0, renderMs: 5, readbackMs: 7, depthReadbackMs: 3, encodeMs: 11, encodeOn: 'worker' })
    const t = finish[0].timing as Record<string, number>
    for (const k of ['uploadMs', 'waitMs', 'captureMs']) expect(t[k]).toBeGreaterThanOrEqual(0)
    expect(finish[0].massing).toBeUndefined()
  })

  it('a massing clay the server could not encode is warned, and the precise clay is returned', async () => {
    const { f } = server({ timing: { massingError: 'ffmpeg exited 1' } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cap: KitFrameCapture = { frame: async () => PNG, dispose: () => {} }
    const out = await exportClay(kitStage, rec, pack, 'loc-k', () => {}, { fetch: f, kitCapture: () => cap, sleep: async () => {} })
    expect(out.status).toBe('done')
    expect(warn.mock.calls.join(' ')).toMatch(/massing clay was not made.*ffmpeg exited 1/)
    warn.mockRestore()
  })
})
