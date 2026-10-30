// @vitest-environment jsdom
// The join's seams on Shoot's still strip, through HeroStillBlock (not HeroStrip alone): a still carried across a re-lock says so in
// the lightbox caption; a redraw kept on an UNAPPROVED still lands in the strip without an approve (the strip reads the stills again).
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PassCandidate } from '../../shared/passContract'
import type { HeroStill, TakeRecord } from '../../shared/shotContract'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { resetSceneJobs } from '../../jobs/sceneJobs'
import { resetCurrentTake, setCurrentTake } from './currentTake'
import { HeroStillBlock } from './HeroStillBlock'
import { resetClayStore } from './takeClay'

const take: TakeRecord = { id: 'take-1', worldId: 'loc-1', packId: 'pack-1', fps: 24, frames: 121, perfStart: 0, startKey: 'aaaa0001', focal: 35, viewAspect: 16 / 9,
  samples: [{ t: 0, position: [0, 1.6, 4], quaternion: [0, 0, 0, 1], focal: 35, focus: 4 }], lockedAt: '2026-10-22T12:00:00.000Z', createdAt: '2026-10-22T12:00:00.000Z' }
const still = (id: string, over: Partial<HeroStill> = {}): HeroStill => ({ id, takeId: 'take-1', startKey: 'aaaa0001', png: `/lab-assets/shots/take-1/hero/${id}.png`, seed: 7, jobId: 'j', credits: 1,
  approved: false, createdAt: '2026-10-22T13:00:01.000Z', ...over })
const candidate = (state: PassCandidate['state']): PassCandidate => ({ id: 'pass-1', takeId: 'take-1', pass: 'face', target: { kind: 'still', stillId: 'hero-a1' }, subject: 'hero', box: { x: 0, y: 0, w: 10, h: 10 },
  state, beforeUrl: '/b.png', afterUrl: '/a.png', beforeCropUrl: '/bc.png', afterCropUrl: '/ac.png', jobId: 'job-1', costCredits: 3, createdAt: '2026-10-25T10:01:00.000Z' })
const lab = { stage: null, s: { source: 'loc-1' } } as unknown as ProjectionLabState

function serve(stills: HeroStill[]) {
  const s = { stills, calls: [] as string[], redrawnInto: null as string | null, list: [candidate('candidate')] }
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    s.calls.push(`${init?.method ?? 'GET'} ${u.split('?')[0]}`)
    if (u.startsWith('/__lab/hero/preview')) return json({ role: 'opening', frame: 0, prompt: 'p', composed: 'p', edited: false, preset: 'photographic', count: 2, price: 42, refs: [], depthUrl: null })
    if (u.startsWith('/__lab/hero/judge')) return json({ stillId: 'hero-a1', frame: 0, kit: true, width: 1920, height: 1088, layout: null, flagged: false, prices: { face: 3, prop: 3 }, redrawnInto: s.redrawnInto,
      people: [{ entity: 'hero', name: 'Ana', cardId: 'ana', cardUrl: '/f.png', box: { x: 1, y: 1, w: 9, h: 9 }, face: null, status: 'ok', match: 0.6 }], pieces: [] })
    if (u === '/__lab/passes/keep') {
      s.list = [candidate('kept')]; s.redrawnInto = 'hero-a1-r1'
      s.stills = [still('hero-a1-r1', { createdAt: '2026-10-22T13:00:02.000Z' }), ...s.stills]
      return json({ candidate: s.list[0] })
    }
    if (u.startsWith('/__lab/passes')) return json({ candidates: s.list })
    if (u.startsWith('/__lab/takes')) return json({ takes: [take] })
    if (u.startsWith('/__lab/clay')) return json({ clay: null })
    return json({ stills: s.stills, opening: { present: true, startKey: 'aaaa0001' }, running: null, unrecovered: [], unfinished: [] })
  }))
  return s
}

beforeEach(() => { resetCurrentTake(); resetClayStore(); setCurrentTake('take-1') })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetClayStore(); resetSceneJobs() })

describe('Shoot\'s still strip across the joins', () => {
  it('a carried opening still is captioned "carried over" in the lightbox', async () => {
    serve([still('hero-a1', { approved: true, carriedFrom: 'take-0' })])
    render(<HeroStillBlock lab={lab} capture={async () => new Blob(['x'])} />)
    fireEvent.click(await screen.findByTestId('hero-open-hero-a1'))
    expect(screen.getByTestId('lightbox-label').textContent).toMatch(/^Opening · seed 7 · approved · carried over/)
  })

  it('Keep of a redraw on an unapproved still: the new still is in the strip, and nothing was approved', async () => {
    const s = serve([still('hero-a1')])
    render(<HeroStillBlock lab={lab} capture={async () => new Blob(['x'])} />)
    fireEvent.click(await screen.findByTestId('hero-approve-hero-a1'))
    await screen.findByTestId('pass-candidate')
    for (const k of ['pass-before', 'pass-after']) act(() => { fireEvent.load(screen.getByTestId(k)) })
    fireEvent.click(screen.getByTestId('pass-keep'))
    await waitFor(() => expect(screen.getByTestId('hero-still-hero-a1-r1')).toBeTruthy())
    expect(s.calls).not.toContain('POST /__lab/hero/approve')
  })
})
