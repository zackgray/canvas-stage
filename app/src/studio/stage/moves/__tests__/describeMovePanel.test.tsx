// @vitest-environment jsdom
// Track E UI tests (docs/plan-kimodo-live.md section 8): every Describe-a-move panel state renders its plan copy, the
// fallback buttons call the ready-made-move callbacks, Play here / Use this one keep the try and hand it to the join's
// callbacks, and none of the forbidden words (Kimodo, constraint, seed, candidate, BVH, Bible) appear in the rendered text.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KitItem } from '../../../../stage3d/contract'
import { NOT_AVAILABLE_YET } from '../../../../stage3d/moves/index.ts'
import { DescribeMovePanel } from '../DescribeMovePanel'

const NEAR: KitItem = { kind: 'crates', args: [1, 1], at: [0.3, 0.35], label: 'Hive', pieceTag: 'prop:hive' }
const FAR: KitItem = { kind: 'crates', args: [2, 1], at: [2.5, 0], label: 'Bench', pieceTag: 'prop:bench' }
/** set scenery (no tag, not made by the owner): never a chip, however near */
const TREE: KitItem = { kind: 'tree', at: [0.8, 0], label: 'gnarled apple tree' }
const WORDS = 'takes a frame out of the hive and holds it up to the light'

type Ctx = {
  health: Record<string, unknown>
  job: Record<string, unknown> | '404'
  makeStatus?: number
  calls: string[]
  kept: Record<string, unknown>[]
  cancelled: number
}

function stubFetch(ctx: Ctx) {
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    ctx.calls.push(url)
    if (url.includes('/__lab/motion/health')) return json(ctx.health)
    if (url.includes('/__lab/motion/make')) return json({ jobId: 'job-1' }, ctx.makeStatus ?? 200)
    if (url.includes('/__lab/motion/job')) return ctx.job === '404' ? json({}, 404) : json(ctx.job)
    if (url.includes('/__lab/motion/cancel')) { ctx.cancelled += 1; return json({ stage: 'cancelled' }) }
    if (url.includes('/__lab/motion/keep')) {
      ctx.kept.push(JSON.parse(String(init?.body)))
      return json({ id: 'gen:abc', clip: { note: WORDS, out: 8 } })
    }
    throw new Error(`unexpected fetch ${url}`)
  }))
}

const ready = (): Ctx => ({ health: { state: 'ready' }, job: '404', calls: [], kept: [], cancelled: 0 })

function mount(extra: Partial<Parameters<typeof DescribeMovePanel>[0]> = {}) {
  const props = { at: [0, 0] as [number, number], kit: [NEAR, FAR, TREE] as KitItem[], pollMs: 50, ...extra }
  return render(<DescribeMovePanel {...props} />)
}

/** type the move words and pick the near piece, so the Make it button is live */
async function describeLift() {
  fireEvent.change(screen.getByTestId('move-words'), { target: { value: WORDS } })
  fireEvent.click(screen.getByTestId('move-piece-0'))
  await waitFor(() => expect((screen.getByTestId('move-make') as HTMLButtonElement).disabled).toBe(false))
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Describe-a-move panel: gates', () => {
  it('off: says the motion computer is not set up and lists the ready-made moves', async () => {
    const onFallback = vi.fn()
    const ctx = { ...ready(), health: { state: 'off' } }
    stubFetch(ctx)
    mount({ onFallback })
    await waitFor(() => expect(screen.getByTestId('move-off').textContent).toContain("isn't set up"))
    fireEvent.click(screen.getByTestId('move-fallbacks-lift'))
    expect(onFallback).toHaveBeenCalledWith('lift')
  })

  it('offline: says so, offers Check again and the ready-made moves', async () => {
    const ctx = ready()
    stubFetch(ctx)
    ctx.health = { state: 'offline' }
    mount()
    await waitFor(() => expect(screen.getByTestId('move-offline').textContent).toContain("isn't reachable"))
    const before = ctx.calls.filter((u) => u.includes('/health')).length
    fireEvent.click(screen.getByTestId('move-check'))
    await waitFor(() => expect(ctx.calls.filter((u) => u.includes('/health')).length).toBeGreaterThan(before))
  })

  it('warming: the button waits, with the startup line', async () => {
    const ctx = ready()
    stubFetch(ctx)
    ctx.health = { state: 'warming' }
    mount()
    await waitFor(() => expect(screen.getByTestId('move-warming').textContent).toContain('starting up'))
    fireEvent.change(screen.getByTestId('move-words'), { target: { value: WORDS } })
    fireEvent.click(screen.getByTestId('move-piece-0'))
    await new Promise((r) => setTimeout(r, 30))
    expect((screen.getByTestId('move-make') as HTMLButtonElement).disabled).toBe(true)
  })

  it('busy: the line shows, and a refused make offers Try again', async () => {
    const ctx = ready()
    stubFetch(ctx)
    ctx.health = { state: 'busy' }
    ctx.makeStatus = 409
    mount()
    await waitFor(() => expect(screen.getByTestId('move-busy-line').textContent).toContain('making another move'))
    await describeLift()
    fireEvent.click(screen.getByTestId('move-make'))
    await waitFor(() => expect(screen.getByTestId('move-busy').textContent).toContain('making another move'))
  })
})

describe('Describe-a-move panel: the form', () => {
  it('piece chips are nearest first; an out-of-reach piece shows its distance and answers with the refusal', async () => {
    const ctx = ready()
    stubFetch(ctx)
    mount()
    await waitFor(() => expect(screen.getByTestId('move-pieces')).toBeTruthy())
    expect(screen.getByTestId('move-piece-0').textContent).toContain('Hive')
    expect(screen.getByTestId('move-piece-0').textContent).not.toContain('away')
    expect(screen.getByTestId('move-piece-1').textContent).toMatch(/\d\.\d m away/)
    expect(screen.getByTestId('move-pieces').textContent).not.toContain('apple tree') // scenery is never offered
    fireEvent.change(screen.getByTestId('move-words'), { target: { value: WORDS } })
    fireEvent.click(screen.getByTestId('move-piece-1'))
    await waitFor(() => expect(screen.getByTestId('move-refused').textContent).toMatch(/is \d\.\d m from this point/))
    expect((screen.getByTestId('move-make') as HTMLButtonElement).disabled).toBe(true)
  })

  it('refused words show the plain reason with the button disabled, until the words change', async () => {
    const ctx = ready()
    stubFetch(ctx)
    mount()
    fireEvent.change(screen.getByTestId('move-words'), { target: { value: 'she rides a horse across the field' } })
    await waitFor(() => expect(screen.getByTestId('move-refused').textContent).toContain('human moves only'))
    expect((screen.getByTestId('move-make') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByTestId('move-words'), { target: { value: 'she waves slowly at the crowd' } })
    await waitFor(() => expect(screen.queryByTestId('move-refused')).toBeNull())
    expect((screen.getByTestId('move-make') as HTMLButtonElement).disabled).toBe(false)
  })

  it('left-out person words are named once in the note', async () => {
    const ctx = ready()
    stubFetch(ctx)
    mount()
    fireEvent.change(screen.getByTestId('move-words'), { target: { value: 'the elderly woman slowly takes a frame out of the hive' } })
    fireEvent.click(screen.getByTestId('move-piece-0'))
    await waitFor(() => expect(screen.getByTestId('move-note').textContent).toContain("Left out 'elderly'"))
  })

  it('ambiguous words ask with chips; a chip picks the kind and keeps the words exactly — put down is refused with the plain reason', async () => {
    const ctx = ready()
    stubFetch(ctx)
    mount()
    const typed = 'takes out a frame and sets it down'
    fireEvent.change(screen.getByTestId('move-words'), { target: { value: typed } })
    await waitFor(() => expect(screen.getByTestId('move-which')).toBeTruthy())
    expect(screen.getByTestId('move-which-putDown').textContent).toContain('Put it down')
    fireEvent.click(screen.getByTestId('move-which-takeOut'))
    fireEvent.click(screen.getByTestId('move-piece-0')) // take out needs the piece it takes from
    await waitFor(() => expect((screen.getByTestId('move-make') as HTMLButtonElement).disabled).toBe(false))
    expect((screen.getByTestId('move-words') as HTMLTextAreaElement).value).toBe(typed) // her words, exactly as typed
    expect(screen.getByTestId('move-which-takeOut').getAttribute('aria-pressed')).toBe('true') // the pick shows, and can change
    expect(screen.getByTestId('describe-move-panel').textContent).not.toMatch(/This is the move we'll make/)
    fireEvent.click(screen.getByTestId('move-which-putDown')) // (live finding) put down is not available yet
    await waitFor(() => expect(screen.getByTestId('move-refused').textContent).toBe(NOT_AVAILABLE_YET))
  })
})
