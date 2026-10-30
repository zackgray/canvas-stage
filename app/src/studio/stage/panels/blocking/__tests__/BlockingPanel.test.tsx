// @vitest-environment jsdom
// Track E1 + merge 6c (live-save): Shoot's Blocking panel on a kit world: select a point on his path and place a stop there,
// add a crossing extra, pick who plays him from the Bible's cast tags — every edit saves itself (free) through the performance
// route and tells the viewport; a refusal keeps the draft and says why.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BibleRecord } from '../../../../../shared/bibleContract'
import { BATTLEFIELD } from '../../../../../stage3d/presets'
import { KIT_CHANGED, type KitWorld } from '../../../../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../../../../labs/projection/useProjectionLab'
import { viewBox } from '../blockingMath'
import { BlockingPanel } from '../index'

const ID = 'loc-2026-10-23T03-00-01-000'
const PATH: [number, number][] = [[0.6, -12.5], [0.6, -8]]
const world: KitWorld = { id: ID, description: 'd', plan: BATTLEFIELD, perf: { path: PATH, pace: 0.8, castId: 'brann' }, still: null, createdAt: '' }
const bible = {
  worldId: ID, version: 1, prompt: '', master: null, candidates: [], lighting: '', materials: '', grade: null, createdAt: '', updatedAt: '',
  elements: [{ tag: 'brann', kind: 'cast', cardId: 'brann', refs: [], line: '' }, { tag: 'sloane', kind: 'cast', cardId: 'sloane', refs: [], line: '' },
    { tag: 'runners', kind: 'extras', refs: [], line: 'runners in grey' }],
  extrasSheet: { png: '/x.png', variants: 6 },
} satisfies BibleRecord
const lab = (w: KitWorld | null) => ({ kit: { id: w?.id ?? null, world: w, layer: null, perf: w?.perf ?? null, error: null } }) as unknown as ProjectionLabState

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

/** a click on the top view at ground point (x, z): the element is drawn 10 px per metre, so no letterbox */
function clickGround(x: number, z: number) {
  const box = viewBox(BATTLEFIELD, [PATH])
  const svg = screen.getByTestId('blocking-top-view')
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: (box[2] - box[0]) * 10, height: (box[3] - box[1]) * 10 } as DOMRect)
  fireEvent.click(svg, { clientX: (x - box[0]) * 10, clientY: (z - box[1]) * 10 })
}

describe('BlockingPanel', () => {
  it('off a kit world it says so', () => {
    render(<BlockingPanel lab={lab(null)} />)
    expect(screen.getByTestId('blocking-none').textContent).toContain('kit world')
  })

  it('places a stop on a path point, adds a crossing extra, recasts him and saves it all (free), telling the viewport', async () => {
    const calls: { url: string; body?: unknown }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ url, body })
      if (url.startsWith('/__lab/bible')) return new Response(JSON.stringify({ bible }), { status: 200 })
      return new Response(JSON.stringify({ ...world, perf: body }), { status: 200 })
    }))
    const changed = vi.fn()
    window.addEventListener(KIT_CHANGED, changed)
    render(<BlockingPanel lab={lab(world)} />)
    await waitFor(() => expect(screen.getByTestId('blocking-cast')).toBeTruthy())
    expect(screen.queryByTestId('blocking-save')).toBeNull() // live-save: there is no Save button
    expect(screen.queryByTestId('blocking-unsaved')).toBeNull()

    clickGround(0.6, -8) // select his end point
    expect(screen.getByTestId('blocking-point-line').textContent).toBe('Point 2 selected.')
    fireEvent.click(screen.getByTestId('blocking-action-add-stop'))
    expect(screen.getByTestId('blocking-action-0').textContent).toContain('4.5 m')

    fireEvent.click(screen.getByTestId('blocking-extra-preset-behind'))
    expect(screen.getByTestId('blocking-extra-path-0')).toBeTruthy()
    fireEvent.change(screen.getByTestId('blocking-extra-0-tag'), { target: { value: 'runners' } })
    fireEvent.change(screen.getByTestId('blocking-cast'), { target: { value: 'sloane' } })

    await waitFor(() => expect(calls.some((c) => c.url.startsWith('/__lab/stage3d/performance'))).toBeTruthy(), { timeout: 3000 })
    const save = calls.find((c) => c.url.startsWith('/__lab/stage3d/performance'))!
    expect(save.url).toBe(`/__lab/stage3d/performance?id=${ID}`)
    expect(save.body).toEqual({
      path: PATH, pace: 0.8, castId: 'sloane',
      actions: [{ kind: 'stop', at: 4.5, seconds: 1.5 }],
      extras: [{ path: [[-6.4, -15.5], [7.6, -14.5]], gait: 'run', delay: 0, costume: 'modern', variant: 0, tag: 'runners' }],
    })
    expect(changed).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByTestId('blocking-saved').textContent).toBe('Saved.'), { timeout: 3000 }) // saved = no change
    window.removeEventListener(KIT_CHANGED, changed)
  })

  it('New path clears the actions placed on the old one, and a path through a kit piece is flagged', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 501 })))
    const w = { ...world, perf: { ...world.perf, actions: [{ kind: 'kneel' as const, at: 4.5, seconds: 2 }] } }
    render(<BlockingPanel lab={lab(w)} />)
    expect(screen.getByTestId('blocking-action-0').textContent).toContain('point 2')
    fireEvent.click(screen.getByTestId('blocking-path-new'))
    expect(screen.getByTestId('blocking-action-0')).toBeTruthy() // m12: a drawn path is not cleared without asking
    fireEvent.click(screen.getByTestId('blocking-path-ask-yes'))
    expect(screen.queryByTestId('blocking-action-0')).toBeNull()
    const piece = BATTLEFIELD.kit.findIndex((k) => !k.walkThrough && Math.abs(k.at[0]) < 30 && Math.abs(k.at[1]) < 30)
    const [px, pz] = BATTLEFIELD.kit[piece].at
    clickGround(px - 3, pz); clickGround(px + 3, pz)
    expect(screen.getByTestId('blocking-through-warning').textContent).toContain(BATTLEFIELD.kit[piece].kind)
    await waitFor(() => expect(screen.getByTestId('blocking-cast')).toBeTruthy()) // no Bible: the saved castId is still shown
  })

  it('Played by saved from Shoot (the only cast character) shows here as saved, not as a stale draft beside an inert Save', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ bible }), { status: 200 })))
    const nobody = { ...world, perf: { path: PATH, pace: 0.8 } }
    const v = render(<BlockingPanel lab={lab(nobody)} />)
    await waitFor(() => expect(screen.getByTestId('blocking-cast')).toBeTruthy())
    expect(screen.queryByTestId('blocking-note')).toBeNull()
    v.rerender(<BlockingPanel lab={lab({ ...nobody, perf: { ...nobody.perf, castId: 'brann' } })} />) // the auto-pick landed
    await waitFor(() => expect(screen.getByTestId('blocking-note').textContent).toMatch(/^Saved: the one picked in Played by now plays the hero/))
    expect((screen.getByTestId('blocking-cast') as HTMLSelectElement).value).toBe('brann')
    expect(screen.getByTestId('blocking-saved').textContent).toBe('Saved.') // no pending change
  })
})
