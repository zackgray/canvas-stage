// @vitest-environment jsdom
// Recipe wave C3 + merge 6c (live-save): an extra can stand and look, a walking path under 3 m is flagged with its length, and
// a named person nobody staged is one click from standing beside the hero. Every edit saves itself, debounced — no Save press.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BibleRecord } from '../../../../../shared/bibleContract'
import type { ExtraPlan } from '../../../../../stage3d/contract'
import { BATTLEFIELD } from '../../../../../stage3d/presets'
import type { KitWorld } from '../../../../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../../../../labs/projection/useProjectionLab'
import { viewBox } from '../blockingMath'
import { lookDeg, standingExtra, unstagedPeople } from '../extraStaging'
import { BlockingPanel } from '../index'

const ID = 'loc-2026-10-23T03-00-01-000'
const PATH: [number, number][] = [[0.6, -12.5], [0.6, -8]]
const SHORT: ExtraPlan = { path: [[4, -10], [4.94, -10]], gait: 'walk', delay: 0, costume: 'modern', variant: 0 }
const world = (extras: ExtraPlan[]): KitWorld => ({ id: ID, description: 'd', plan: BATTLEFIELD, perf: { path: PATH, pace: 0.8, castId: 'brann', extras }, still: null, createdAt: '' })
const bible = {
  worldId: ID, version: 1, prompt: '', master: null, candidates: [], lighting: '', materials: '', grade: null, createdAt: '', updatedAt: '',
  elements: [{ tag: 'brann', kind: 'cast', cardId: 'brann', refs: [], line: '' }, { tag: 'sloane', kind: 'cast', cardId: 'sloane', refs: [], line: '' }],
  extrasSheet: { png: '/x.png', variants: 6 },
} satisfies BibleRecord
const lab = (w: KitWorld) => ({ kit: { id: w.id, world: w, layer: null, perf: w.perf, error: null } }) as unknown as ProjectionLabState

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function clickGround(x: number, z: number) {
  const box = viewBox(BATTLEFIELD, [PATH])
  const svg = screen.getByTestId('blocking-top-view')
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: (box[2] - box[0]) * 10, height: (box[3] - box[1]) * 10 } as DOMRect)
  fireEvent.click(svg, { clientX: (x - box[0]) * 10, clientY: (z - box[1]) * 10 })
}

function stubFetch() {
  const calls: { url: string; body?: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url, body })
    return url.startsWith('/__lab/bible') ? new Response(JSON.stringify({ bible }), { status: 200 }) : new Response(JSON.stringify({ ...world([]), perf: body }), { status: 200 })
  }))
  return calls
}
const savedBody = (calls: { url: string; body?: unknown }[]) => calls.find((c) => c.url.startsWith('/__lab/stage3d/performance'))!.body as { extras: ExtraPlan[] }
// live-save: edits save themselves, debounced — a test just waits for the performance POST
const saved = (calls: { url: string; body?: unknown }[]) =>
  waitFor(() => expect(calls.some((c) => c.url.startsWith('/__lab/stage3d/performance'))).toBeTruthy(), { timeout: 3000 })

describe('extras: short walks, standing, looking', () => {
  it('shows each walking path in metres and flags one under 3 m; Stand clears the flag and keeps one spot', async () => {
    const calls = stubFetch()
    render(<BlockingPanel lab={lab(world([SHORT]))} />)
    expect(screen.getByTestId('blocking-extra-0-length').textContent).toContain('0.9 m')
    expect(screen.getByTestId('blocking-extra-0-short').textContent).toMatch(/will lurch.*stand them.*3 m/)
    fireEvent.change(screen.getByTestId('blocking-extra-0-mode'), { target: { value: 'stand' } })
    expect(screen.queryByTestId('blocking-extra-0-short')).toBeNull()
    expect(screen.getByTestId('blocking-extra-0-length').textContent).toContain('standing')
    await saved(calls)
    expect(savedBody(calls).extras).toEqual([{ ...SHORT, path: [[4, -10]], stand: true }])
  })

  it('a path of 3 m or more is not flagged', () => {
    stubFetch()
    render(<BlockingPanel lab={lab(world([{ ...SHORT, path: [[4, -10], [7, -10]] }]))} />)
    expect(screen.queryByTestId('blocking-extra-0-short')).toBeNull()
  })

  it('Faces… and Look at… take a ground click; the look is turned relative to where the figure faces', async () => {
    const calls = stubFetch()
    render(<BlockingPanel lab={lab(world([{ ...SHORT, path: [[4, -10]], stand: true, face: [4, -5] }]))} />)
    fireEvent.click(screen.getByTestId('blocking-extra-0-look'))
    clickGround(8, -10) // facing +z, looking toward +x = +90
    fireEvent.click(screen.getByTestId('blocking-extra-0-face'))
    clickGround(0, -10)
    await saved(calls)
    const e = savedBody(calls).extras[0]
    expect(e.face).toEqual([0, -10])
    expect(e.actions).toEqual([{ kind: 'look', at: 0, seconds: 3, deg: 90 }])
  })

  it('offers the named person nobody staged and stands them beside the hero, facing him, in one click', async () => {
    const calls = stubFetch()
    render(<BlockingPanel lab={lab(world([]))} />)
    const btn = await screen.findByTestId('blocking-stage-sloane')
    expect(btn.textContent).toContain('standing, facing the hero')
    expect(screen.queryByTestId('blocking-stage-brann')).toBeNull() // the hero is staged by definition
    fireEvent.click(btn)
    expect(screen.queryByTestId('blocking-stage-sloane')).toBeNull()
    await saved(calls)
    const e = savedBody(calls).extras[0]
    expect(e).toMatchObject({ tag: 'sloane', stand: true, face: PATH[0] })
    expect(e.path).toHaveLength(1)
  })
})

describe('extra staging maths', () => {
  it('lists cast that is neither the hero nor an extra tag', () => {
    expect(unstagedPeople(bible, 'brann', []).map((u) => u.tag)).toEqual(['sloane'])
    expect(unstagedPeople(bible, 'brann', [standingExtra('sloane', PATH, 0, 4)])).toEqual([])
    expect(unstagedPeople(bible, '', [])).toEqual([])
  })
  it('a look is relative to the facing and wraps', () => {
    const e: ExtraPlan = { ...SHORT, path: [[0, 0]], stand: true, face: [0, 5] }
    expect(lookDeg(e, null, [5, 0])).toBe(90)
    expect(lookDeg(e, null, [-5, 0])).toBe(-90)
    expect(lookDeg({ ...e, face: [0, -5] }, null, [5, 0])).toBe(-90)
  })
})
