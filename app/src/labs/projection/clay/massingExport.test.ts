// (recipe wave) The kit clay export waits for the world's generated pieces, and when a piece has a massing mesh it renders each
// frame a second time with the massing meshes shown, uploads it beside the precise clay (/__lab/pieces/massing-frame) and
// finishes it; the precise clay is the same as before, and a massing failure never fails it.
import { Group, Mesh, BoxGeometry, MeshBasicMaterial, Scene } from 'three'
import { describe, expect, it, vi } from 'vitest'
import type { ClayExport, TakeRecord } from '../../../shared/shotContract'
import { GLB_MASSING, GLB_PRECISE } from '../../../stage3d/glbPiece'
import type { Stage } from '../engine/Stage'
import { fakeTake } from './__fixtures__/take'
import { exportClay } from './exportClay'
import type { KitFrameCapture } from './kitCapture'
import { lockKey, lockRequest } from './plan'

const pack = { id: 'mocap-0000beef', fps: 24, frames: 400 }
const q = lockRequest(fakeTake(0.5), pack, 'loc-k', 16 / 9) // 9 frames
const rec = { ...q, id: 'take-k', startKey: lockKey(q).startKey, lockedAt: '', createdAt: '' } as TakeRecord
const clay = (over: Partial<ClayExport>): ClayExport => ({ takeId: 'take-k', startKey: rec.startKey, mp4: null, frames: 9, width: 1920, height: 1088, status: 'done', method: 'browser', ...over })

function stage(massingUrl: string | undefined, ready: Promise<void> = Promise.resolve()) {
  const scene = new Scene(), piece = new Group()
  const precise = new Mesh(new BoxGeometry(), new MeshBasicMaterial()); precise.userData[GLB_PRECISE] = true
  const massing = new Mesh(new BoxGeometry(), new MeshBasicMaterial()); massing.userData[GLB_MASSING] = true; massing.visible = false
  piece.add(precise, massing); scene.add(piece)
  const s = { scene, kit: { worldId: 'loc-k', ready, plan: { kit: [{ kind: 'steam locomotive', at: [0, 0], glb: { url: '/lab-assets/a.glb', ...(massingUrl ? { massingUrl } : {}) } }] } } } as unknown as Stage
  return { s, precise, massing }
}
function server(fail: RegExp | null = null) {
  const calls: string[] = []
  const finish: Record<string, unknown>[] = []
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(url)
    if (url.endsWith('/clay/finish')) finish.push(JSON.parse(init!.body as string) as Record<string, unknown>)
    if (fail && fail.test(url)) return new Response('{"error":"disk full"}', { status: 500 })
    if (url.includes('/depth?') || url.includes('/massing-frame?')) return new Response('{"ok":true}')
    if (url.endsWith('/massing-finish')) return new Response('{"takeId":"take-k"}')
    if (url.endsWith('/finish')) return new Response(JSON.stringify({ clay: clay({ status: 'running' }) }), { status: 202 })
    return new Response(JSON.stringify({ clay: clay({ mp4: '/x/clay.mp4' }) }))
  })
  return { f: f as unknown as typeof fetch, calls, finish }
}
function capture(precise: Mesh, massing: Mesh) {
  const seen: string[] = []
  const cap: KitFrameCapture = {
    frame: vi.fn(async () => { seen.push(massing.visible && !precise.visible ? 'massing' : precise.visible && !massing.visible ? 'precise' : 'mixed'); return new Uint8Array([137, 80, 78, 71]) }),
    depth: vi.fn(async () => new Uint8Array([137, 80, 78, 71, 1])),
    dispose: vi.fn(),
  }
  return { cap, seen }
}

describe('the massing clay in the kit export', () => {
  it('each frame twice: precise for the clay, massing beside it (frame and depth), then ONE finish that asks for both videos; precise meshes come back', async () => {
    const { s, precise, massing } = stage('/lab-assets/a-massing.glb')
    const { f, calls, finish } = server()
    const { cap, seen } = capture(precise, massing)
    const out = await exportClay(s, rec, pack, 'loc-k', () => {}, { fetch: f, kitCapture: () => cap, sleep: async () => {} })
    expect(out.status).toBe('done')
    expect(seen).toEqual(Array.from({ length: 9 }, () => ['precise', 'massing']).flat())
    const kinds = (re: string) => calls.filter((c) => c.includes(re)).map((c) => new URL(c, 'http://x').searchParams.get('kind'))
    expect(kinds('/depth?').filter((k) => k === 'final')).toHaveLength(9) // the precise clay as before
    const mFrames = calls.filter((c) => c.includes('/massing-frame?')).map((c) => new URL(c, 'http://x').searchParams).map((p) => `${p.get('kind')}:${p.get('frame')}`)
    expect([...mFrames].sort()).toEqual(Array.from({ length: 9 }, (_, i) => [`final:${i}`, `zdepth:${i}`]).flat().sort()) // uploads overlap across frames now
    // (tidy wave) no massing finish awaited before the precise one: the clay finish encodes massing.mp4 beside clay.mp4
    expect(calls.some((c) => c.endsWith('/massing-finish'))).toBe(false)
    expect(finish).toHaveLength(1)
    expect(finish[0]).toMatchObject({ massing: true, timing: { frames: 9, massingFrames: 9 } })
    expect([precise.visible, massing.visible]).toEqual([true, false])
  })

  it('no massing mesh on the set: no second render, no massing uploads', async () => {
    const { s, precise, massing } = stage(undefined)
    const { f, calls } = server()
    const { cap, seen } = capture(precise, massing)
    await exportClay(s, rec, pack, 'loc-k', () => {}, { fetch: f, kitCapture: () => cap, sleep: async () => {} })
    expect(seen).toHaveLength(9)
    expect(calls.some((c) => c.includes('massing'))).toBe(false)
  })

  it('a failed massing upload stops the massing clay only: the precise clay finishes', async () => {
    const { s, precise, massing } = stage('/lab-assets/a-massing.glb')
    const { f, calls, finish } = server(/massing-frame/)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { cap } = capture(precise, massing)
    const out = await exportClay(s, rec, pack, 'loc-k', () => {}, { fetch: f, kitCapture: () => cap, sleep: async () => {} })
    expect(out.status).toBe('done')
    expect(calls.some((c) => c.endsWith('/massing-finish'))).toBe(false)
    expect(finish[0].massing).toBeUndefined() // the server is not asked to encode a partial massing set
    expect(warn.mock.calls.join(' ')).toMatch(/massing clay was not made.*disk full/)
    warn.mockRestore()
  })

  it('waits for the world\'s pieces before the first frame (a frame without the train is a wrong set)', async () => {
    let open: () => void = () => {}
    const { s, precise, massing } = stage(undefined, new Promise<void>((r) => { open = r }))
    const { f } = server()
    const { cap } = capture(precise, massing)
    const run = exportClay(s, rec, pack, 'loc-k', () => {}, { fetch: f, kitCapture: () => cap, sleep: async () => {} })
    await new Promise((r) => setTimeout(r, 20))
    expect(cap.frame).not.toHaveBeenCalled()
    open()
    await run
    expect(cap.frame).toHaveBeenCalledTimes(9)
  })
})
