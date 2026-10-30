// Play here right after Make it: the page read the clip library before the move was kept, so the kept move is not in it. The
// performer's library is asked for the moves its plan names: a missing one is read in once and merged, and the audition plays the
// move (a stand with it has the move's segments) instead of standing still.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fetchLibrary, fetchLibraryWith } from '../motion/library.ts'
import { heroTimeline } from '../motion/heroPlan.ts'
import { standPath } from '../motion/standPlan.ts'

const PUBLIC = fileURLToPath(new URL('../../../public', import.meta.url))
const CLIP = JSON.stringify({
  url: '/lab-assets/motions/take-frame/clip.bvh', source: { generated: 'kimodo:test/1' }, note: 'takes a frame out of the hive',
  root: 'pinned', in: 1.0, out: 7.95, hold: [4.5, 7.95], prop: { kind: 'frame', grab: 2.5 },
})
let kept = false
beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(async (u: string) => {
    if (u === '/__lab/motion/clips') return new Response(JSON.stringify({ clips: kept ? [{ id: 'gen:take-frame', folder: 'take-frame', note: 'takes a frame out of the hive' }] : [] }))
    if (u === '/lab-assets/motions/take-frame/clip.json') return new Response(CLIP)
    if (u.startsWith('/lab-assets/motions/')) return new Response(readFileSync(PUBLIC + '/mocap/kimodo/lift_frame.bvh', 'utf8'))
    return new Response(readFileSync(PUBLIC + u, 'utf8'))
  }))
})
afterAll(() => vi.unstubAllGlobals())

describe('a move kept after the library was read', () => {
  it('is read in when a plan names it, and the stand plays it', async () => {
    const before = await fetchLibrary() // the page's first read: no made moves yet
    expect(before.clips['gen:take-frame']).toBeUndefined()
    kept = true // Make it, then Play here keeps the move
    const lib = await fetchLibraryWith(['gen:take-frame'])
    expect(lib).toBe(before) // the same shared library, the move merged in
    expect(lib.clips['gen:take-frame']).toBeTruthy()
    const tl = heroTimeline({ path: standPath({ at: [0, 0], yawDeg: 0 }), stand: true, actions: [{ kind: 'move', at: 0, seconds: 1, motion: 'gen:take-frame' }] }, lib)
    expect(tl.segs.map((g) => g.kind)).toContain('move-hold')
  }, 60_000)
})
