// @vitest-environment jsdom
// Track D2 join tests (docs/plan-kimodo-live.md sections 5 and 8): the Describe-a-move button opens Track E's panel in place,
// next to Stop · Look · Turn · Kneel · Lift a frame, on the picked point with the Set's pieces and the hero's tag; Use this one
// saves the made move through the live-saving blocking ops as a move action that the performance route accepts (server/stage3d/
// perf.ts, run here on the saved body); Play here auditions it as one unsaved draft action (movePreview.ts); the ready-made
// fallbacks place Lift a frame while pick up / put down stay disabled with the plain reason; the health line sits on Blocking's
// header. The lab routes are stubbed like BlockingPanel.test.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BibleRecord } from '../../../../../shared/bibleContract'
import { BATTLEFIELD } from '../../../../../stage3d/presets'
import { type KitWorld } from '../../../../../labs/projection/stage3d/kitApi'
import { getMovePreview } from '../../../../../labs/projection/stage3d/movePreview'
import type { ProjectionLabState } from '../../../../../labs/projection/useProjectionLab'
import { parsePerformancePlan } from '../../../../../../server/stage3d/perf.ts'
import { viewBox } from '../blockingMath'
import { BlockingPanel } from '../index'

const ID = 'loc-2026-10-23T03-00-01-000'
// a short path whose end point stands at the battlefield's debris piece (kit index 26, at [3.2, -9]): within arm's reach,
// so the panel lists it as a chip and a take-out move measures it
const PATH: [number, number][] = [[3.2, -10.4], [3.2, -9.6]]
const DEBRIS_AT: [number, number] = [3.2, -9]
const WORDS = 'takes a frame out of the debris and holds it up'
// the debris is the owner's tagged prop (only props are offered as chips; scenery never is)
const PLAN = { ...BATTLEFIELD, kit: BATTLEFIELD.kit.map((k, i) => (i === 26 ? { ...k, pieceTag: 'prop:debris' } : k)) }
const world: KitWorld = { id: ID, description: 'd', plan: PLAN, perf: { path: PATH, pace: 0.8, castId: 'brann' }, still: null, createdAt: '' }
const bible = {
  worldId: ID, version: 1, prompt: '', master: null, candidates: [], lighting: '', materials: '', grade: null, createdAt: '', updatedAt: '',
  elements: [{ tag: 'brann', kind: 'cast', cardId: 'brann', refs: [], line: '' }],
  extrasSheet: { png: '/x.png', variants: 6 },
} satisfies BibleRecord
const lab = (w: KitWorld | null) => ({ kit: { id: w?.id ?? null, world: w, layer: null, perf: w?.perf ?? null, error: null } }) as unknown as ProjectionLabState

type Ctx = {
  health: Record<string, unknown>
  job: Record<string, unknown> | '404'
  calls: { url: string; body?: unknown }[]
  kept: unknown[]
}

function stubFetch(ctx: Ctx) {
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    ctx.calls.push({ url, body })
    if (url.startsWith('/__lab/bible')) return json({ bible })
    if (url.startsWith('/__lab/stage3d/performance')) return json({ ...world, perf: body })
    if (url.includes('/__lab/motion/health')) return json(ctx.health)
    if (url.includes('/__lab/motion/make')) {
      ctx.job = { id: 'job-1', stage: 'encoding', done: 0, of: 8, round: 1, tries: [], dropped: { count: 0, reason: '' }, owner: world.id }
      return json({ jobId: 'job-1' })
    }
    if (url.includes('/__lab/motion/job')) return ctx.job === '404' ? json({}, 404) : json(ctx.job)
    if (url.includes('/__lab/motion/keep')) { ctx.kept.push(body); return json({ id: 'gen:take-frame', clip: { out: 8, hold: [3.1, 7.8] } }) }
    throw new Error(`unexpected fetch ${url}`)
  }))
}

const ready = (state: string): Ctx => ({ health: { state }, job: '404', calls: [], kept: [] })
const saves = (ctx: Ctx) => ctx.calls.filter((c) => c.url.startsWith('/__lab/stage3d/performance'))

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

/** a click on the top view at ground point (x, z): the element is drawn 10 px per metre, so no letterbox */
function clickGround(x: number, z: number) {
  const box = viewBox(BATTLEFIELD, [PATH])
  const svg = screen.getByTestId('blocking-top-view')
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: (box[2] - box[0]) * 10, height: (box[3] - box[1]) * 10 } as DOMRect)
  fireEvent.click(svg, { clientX: (x - box[0]) * 10, clientY: (z - box[1]) * 10 })
}

describe('Describe-a-move joined into Blocking (track D2)', () => {
  it('the health line sits on the Blocking header', async () => {
    const ctx = ready('off')
    stubFetch(ctx)
    render(<BlockingPanel lab={lab(world)} />)
    await waitFor(() => expect(screen.getByTestId('blocking-cast')).toBeTruthy())
    expect(screen.getByTestId('blocking-header').contains(screen.getByTestId('motion-health-line'))).toBe(true)
    await waitFor(() => expect(screen.getByTestId('motion-health-line').textContent).toBe('New moves: off'))
  })

  it('the button opens the panel in place; off, the ready-made moves show, pick up / put down disabled with the reason, Lift a frame places', async () => {
    const ctx = ready('off')
    stubFetch(ctx)
    render(<BlockingPanel lab={lab(world)} />)
    await waitFor(() => expect(screen.getByTestId('blocking-cast')).toBeTruthy())
    expect((screen.getByTestId('describe-move-open') as HTMLButtonElement).disabled).toBe(true) // no point picked yet

    clickGround(3.2, -9.6) // the path's end point
    expect(screen.getByTestId('blocking-point-line').textContent).toBe('Point 2 selected.')
    fireEvent.click(screen.getByTestId('describe-move-open'))
    await waitFor(() => expect(screen.getByTestId('move-off').textContent).toContain('needs the motion computer'))
    expect((screen.getByTestId('move-fallbacks-lift') as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByTestId('move-fallbacks-pickUp') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('move-fallbacks-putDown') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('move-fallbacks-not-ready').textContent).toContain('The ready-made move is not available yet.')

    fireEvent.click(screen.getByTestId('move-fallbacks-lift'))
    expect(screen.getByTestId('blocking-action-0').textContent).toContain('lift') // placed at the point, like the action buttons
    await waitFor(() => expect(saves(ctx).length).toBeGreaterThan(0))
    expect(saves(ctx).at(-1)!.body).toMatchObject({ actions: [{ kind: 'lift', at: 0.8 }] })
  })

  it('Play here auditions the move as one unsaved action; Use this one saves it as a move action the performance route accepts', async () => {
    const ctx = ready('ready')
    stubFetch(ctx)
    render(<BlockingPanel lab={lab(world)} />)
    await waitFor(() => expect(screen.getByTestId('blocking-cast')).toBeTruthy())
    clickGround(3.2, -9.6)
    fireEvent.click(screen.getByTestId('describe-move-open'))
    await waitFor(() => expect(screen.getByTestId('move-words')).toBeTruthy())

    fireEvent.change(screen.getByTestId('move-words'), { target: { value: WORDS } })
    fireEvent.click(screen.getByTestId('move-piece-26')) // the debris, the only piece within reach
    await waitFor(() => expect((screen.getByTestId('move-make') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('move-make'))
    await waitFor(() => expect(ctx.calls.some((c) => c.url.includes('/make'))).toBe(true))
    const [, init] = vi.mocked(fetch).mock.calls.find(([u]) => String(u).includes('/make'))!
    expect(JSON.parse(String(init?.body))).toMatchObject({ spec: { class: 'takeOut', prop: { pieceId: '26' } } })
    ctx.job = { id: 'job-1', stage: 'done', done: 8, of: 8, round: 1, owner: world.id,
      tries: [{ id: 1, seed: 53, rank: 1, reason: 'steadiest hands', scores: {}, seconds: 3.8 }], dropped: { count: 0, reason: '' } }
    await waitFor(() => expect(screen.getByTestId('move-results')).toBeTruthy(), { timeout: 6000 })

    fireEvent.click(screen.getByTestId('move-play')) // the audition: one unsaved move action on the saved performance
    await waitFor(() => expect(getMovePreview()).not.toBeNull())
    const preview = getMovePreview()!
    expect(preview.worldId).toBe(ID)
    expect(preview.perf.actions?.at(-1)).toEqual({ kind: 'move', at: 0.8, seconds: 4.7, motion: 'gen:take-frame', toward: DEBRIS_AT })

    fireEvent.click(screen.getByTestId('move-use')) // placed: the panel closes, the audition drops, the draft live-saves
    await waitFor(() => expect(screen.queryByTestId('move-words')).toBeNull())
    expect(getMovePreview()).toBeNull()
    expect(screen.getByTestId('blocking-action-0').textContent).toContain(WORDS) // the list shows the user's own words
    await waitFor(() => expect(saves(ctx).length).toBeGreaterThan(0), { timeout: 3000 })
    const body = saves(ctx).at(-1)!.body
    expect(body).toEqual({ path: PATH, pace: 0.8, castId: 'brann',
      actions: [{ kind: 'move', at: 0.8, seconds: 4.7, motion: 'gen:take-frame', toward: DEBRIS_AT }] })
    expect(parsePerformancePlan(body)).toEqual({ ok: true, perf: body }) // the route's gate accepts exactly what was saved
    expect(ctx.kept).toEqual([{ job: 'job-1', try: 1, label: WORDS }, { job: 'job-1', try: 1, label: WORDS }]) // play and use each keep the try
  }, 20000)
})
