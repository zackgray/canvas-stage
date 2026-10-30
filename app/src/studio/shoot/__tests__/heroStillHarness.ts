// Shared fixtures for the hero-still block's tests (HeroStillBlock, HeroStillKit, HeroOverlay): a take, a still, a fake hero server.
import { vi } from 'vitest'
import type { HeroStill, TakeRecord } from '../../../shared/shotContract'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'

export const take = (over: Partial<TakeRecord> = {}): TakeRecord => ({
  id: 'take-1', worldId: 'loc-1', packId: 'pack-1', fps: 24, frames: 121, perfStart: 0, startKey: 'aaaa0001', focal: 35, viewAspect: 16 / 9,
  samples: [{ t: 0, position: [0, 1.6, 4], quaternion: [0, 0, 0, 1], focal: 35, focus: 4 }], lockedAt: '2026-10-22T12:00:00.000Z', createdAt: '2026-10-22T12:00:00.000Z', ...over,
})
export const still = (id: string, over: Partial<HeroStill> = {}): HeroStill => ({ id, takeId: 'take-1', startKey: 'aaaa0001', png: `/lab-assets/shots/take-1/hero/${id}.png`, seed: 7, jobId: 'j', credits: 1, approved: false, createdAt: `2026-10-22T13:00:0${id.slice(-1)}.000Z`, ...over })
export const lab = { stage: null, s: { source: 'loc-1' } } as unknown as ProjectionLabState

export interface Server { takes: TakeRecord[]; stills: HeroStill[]; opening: { present: boolean; startKey: string | null }; calls: string[]; unrecovered?: object[]; renderError?: object; unfinished?: object[]; clay?: object | null; renderStatus?: number
  /** fields the free press preview answers on top of its default (e.g. `nobody: true`) */ preview?: object }
export function serve(s: Server) {
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url)
    // the free press preview (StillPreview.test.tsx covers it) is not one of the calls these tests count
    if (path.startsWith('/__lab/hero/preview')) return json({ role: 'opening', frame: 0, prompt: 'Photo of x.', composed: 'Photo of x.', edited: false, preset: 'photographic', count: 2, price: 42, refs: [], depthUrl: null, ...s.preview })
    // the free still judge in the lightbox and its pass list (StillJudge.test.tsx covers them): a still with nothing to flag
    if (path.startsWith('/__lab/hero/judge')) return json({ stillId: 'x', frame: 0, kit: false, width: 1920, height: 1088, layout: null, people: [], pieces: [], flagged: false, prices: { face: 3, prop: 3 }, redrawnInto: null })
    if (path.startsWith('/__lab/passes')) return json({ candidates: [] })
    s.calls.push(`${init?.method ?? 'GET'} ${path.split('?')[0]}`)
    if (path.startsWith('/__lab/takes')) return json({ takes: s.takes })
    if (path.startsWith('/__lab/clay')) return json({ clay: s.clay ?? null })
    if (path.startsWith('/__lab/hero/opening')) { s.opening = { present: true, startKey: s.takes[0].startKey }; return json({ ok: true }) }
    if (path.startsWith('/__lab/hero/approve')) {
      const id = JSON.parse(String(init?.body)).stillId as string
      s.stills = s.stills.map((x) => ({ ...x, approved: x.id === id }))
      return json({ still: s.stills.find((x) => x.id === id) })
    }
    if (path.startsWith('/__lab/jobs/recover')) { s.unrecovered = []; return json({ ok: true }) }
    if (path.startsWith('/__lab/hero/finish')) { s.unfinished = []; s.stills = [still('hero-fin1'), ...s.stills]; return json({ still: s.stills[0] }) }
    if (path.startsWith('/__lab/hero') && init?.method === 'POST') {
      if (s.renderError) return json(s.renderError, s.renderStatus ?? 502)
      s.stills = [still('hero-new1'), ...s.stills]; return json({ still: s.stills[0] })
    }
    return json({ stills: s.stills, opening: s.opening, running: null, unrecovered: s.unrecovered ?? [], unfinished: s.unfinished ?? [] })
  }))
}
export const base = (over: Partial<Server> = {}): Server => ({ takes: [take()], stills: [], opening: { present: false, startKey: null }, calls: [], ...over })

/** take-1's clay, finished, with the per-frame depth a kit still is drawn on */
export const clayDone = (o: object = {}) => ({ takeId: 'take-1', startKey: 'aaaa0001', mp4: '/c.mp4', frames: 121, width: 1920, height: 1088, status: 'done', finishedAt: 'f1', depth: { unitM: 0.001 }, ...o })
