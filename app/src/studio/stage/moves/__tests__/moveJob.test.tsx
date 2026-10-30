// @vitest-environment jsdom
// Track E UI tests, job half (docs/plan-kimodo-live.md section 8): making with progress and Cancel, results with cards whose
// Play here / Use this one keep the try and call the join callbacks, failed with fallbacks, and lost contact with Check again.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KitItem } from '../../../../stage3d/contract'
import { DescribeMovePanel } from '../DescribeMovePanel'

const NEAR: KitItem = { kind: 'crates', args: [1, 1], at: [0.3, 0.35], label: 'Hive', pieceTag: 'prop:hive' }
const WORDS = 'takes a frame out of the hive and holds it up to the light'

const JOB = (stage: string, over: Record<string, unknown> = {}) => ({
  id: 'job-1', stage, done: 3, of: 8, round: 1, tries: [], dropped: { count: 0, reason: '' }, ...over,
})

type Ctx = {
  health: Record<string, unknown>
  job: Record<string, unknown> | '404'
  calls: string[]
  kept: Record<string, unknown>[]
  cancelled: number
}

function stubFetch(ctx: Ctx) {
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    ctx.calls.push(url)
    if (url.includes('/__lab/motion/health')) return json(ctx.health)
    if (url.includes('/__lab/motion/make')) {
      ctx.job = JOB('encoding') // the plugin writes the in-flight record: the next /job read sees the job
      return json({ jobId: 'job-1' })
    }
    if (url.includes('/__lab/motion/job')) return ctx.job === '404' ? json({}, 404) : json(ctx.job)
    if (url.includes('/__lab/motion/cancel')) { ctx.cancelled += 1; return json({ stage: 'cancelled' }) }
    if (url.includes('/__lab/motion/shown')) return json({ shown: JSON.parse(String(init?.body)).shown })
    if (url.includes('/__lab/motion/discard')) { ctx.job = '404'; return json({}) }
    if (url.includes('/__lab/motion/keep')) {
      ctx.kept.push(JSON.parse(String(init?.body)))
      return json({ id: 'gen:abc', clip: { note: WORDS, out: 8 } })
    }
    throw new Error(`unexpected fetch ${url}`)
  }))
}

const ready = (): Ctx => ({ health: { state: 'ready' }, job: '404', calls: [], kept: [], cancelled: 0 })

function mount(extra: Partial<Parameters<typeof DescribeMovePanel>[0]> = {}) {
  return render(<DescribeMovePanel at={[0, 0]} kit={[NEAR]} pollMs={50} {...extra} />)
}

/** type the words, pick the piece, press Make it; the words stay in state for Try again / Make 8 more */
async function makeMove(ctx: Ctx) {
  fireEvent.change(screen.getByTestId('move-words'), { target: { value: WORDS } })
  fireEvent.click(screen.getByTestId('move-piece-0'))
  await waitFor(() => expect((screen.getByTestId('move-make') as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByTestId('move-make'))
  await waitFor(() => expect(ctx.calls.some((u) => u.includes('/make'))).toBe(true))
  const [, init] = vi.mocked(fetch).mock.calls.find(([u]) => String(u).includes('/make'))!
  return JSON.parse(String(init?.body)) as { spec: { class: string; sentence: string; seconds: number }; n?: number }
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Describe-a-move panel: making and results', () => {
  it('makes the move: a working line with the time so far and an honest wait, with Cancel, which stops the job', async () => {
    const ctx = ready()
    stubFetch(ctx)
    mount()
    const made = await makeMove(ctx)
    expect(made.spec).toMatchObject({ class: 'takeOut', seconds: 8 })
    expect(made.spec.sentence).toContain('A person stands still, then')
    ctx.job = JOB('generating')
    await waitFor(() => expect(screen.getByTestId('move-making').textContent).toContain('Making the move on your motion computer'))
    expect(screen.getByTestId('move-making').textContent).not.toMatch(/of 8|tries/)
    // the motion box says its progress inside the stage; any stage that is not an ending stays the working state, never a blank panel
    ctx.job = JOB('queued 1/2')
    await new Promise((r) => setTimeout(r, 150))
    expect(screen.getByTestId('move-making')).toBeTruthy()
    ctx.job = JOB('cancelled')
    fireEvent.click(screen.getByTestId('move-cancel'))
    await waitFor(() => expect(ctx.cancelled).toBe(1))
    await waitFor(() => expect(screen.getByTestId('move-cancelled')).toBeTruthy())
    fireEvent.click(screen.getByTestId('move-new'))
    await waitFor(() => expect(screen.getByTestId('move-words')).toBeTruthy())
  })

  it('the result is one move, the best (steadiest hands): no try names or counts; Play here and Use this one keep that try', async () => {
    const onPlayHere = vi.fn(), onUseThisOne = vi.fn()
    const ctx = ready()
    stubFetch(ctx)
    mount({ onPlayHere, onUseThisOne })
    await makeMove(ctx)
    ctx.job = JOB('done', {
      done: 8,
      tries: [
        { id: 2, seed: 71, rank: 2, reason: 'closest to the piece', scores: {}, seconds: 3.9 },
        { id: 1, seed: 53, rank: 1, reason: 'steadiest hands', scores: {}, seconds: 3.8 },
      ],
      dropped: { count: 5, reason: '5 of 8 dropped because the hands did not hold the frame steadily' },
    })
    await waitFor(() => expect(screen.getByTestId('move-results')).toBeTruthy())
    const text = screen.getByTestId('move-results').textContent!
    for (const no of ['steadiest', 'closest', 'of 8', 'dropped', 'make 8', 'None of these']) expect(text).not.toContain(no)
    expect(screen.getAllByTestId('move-play')).toHaveLength(1)
    fireEvent.click(screen.getByTestId('move-play'))
    await waitFor(() => expect(onPlayHere).toHaveBeenCalledWith(expect.objectContaining({ clipId: 'gen:abc', words: WORDS })))
    expect(ctx.kept[0]).toMatchObject({ job: 'job-1', try: 1 }) // rank 1, whatever order the box listed them in
    fireEvent.click(screen.getByTestId('move-use'))
    await waitFor(() => expect(onUseThisOne).toHaveBeenCalledWith(expect.objectContaining({ clipId: 'gen:abc' })))
    await waitFor(() => expect(ctx.calls.some((u) => u.includes('/discard'))).toBe(true)) // she has her move: the result is done with
  })

  it('Try another shows the next-best (kept with the result), then makes a fresh round when none are left', async () => {
    const ctx = ready()
    stubFetch(ctx)
    mount()
    await makeMove(ctx)
    ctx.job = JOB('done', { done: 8, tries: [{ id: 1, seed: 53, rank: 1, reason: 'a', scores: {}, seconds: 3.8 }, { id: 2, seed: 7, rank: 2, reason: 'b', scores: {}, seconds: 3.8 }] })
    await waitFor(() => expect(screen.getByTestId('move-results')).toBeTruthy())
    fireEvent.click(screen.getByTestId('move-another'))
    await waitFor(() => expect(ctx.calls.some((u) => u.includes('/shown'))).toBe(true))
    ctx.job = { ...(ctx.job as Record<string, unknown>), shown: 1 }
    fireEvent.click(screen.getByTestId('move-play'))
    await waitFor(() => expect(ctx.kept[0]).toMatchObject({ try: 2 }))
    fireEvent.click(screen.getByTestId('move-another')) // none left: a fresh round, free
    await waitFor(() => expect(ctx.calls.filter((u) => u.includes('/make')).length).toBe(2))
  })
})

describe('Describe-a-move panel: failed and lost', () => {
  it('failed: the plain line, the ready-made moves, and Try again makes the same spec again', async () => {
    const onFallback = vi.fn()
    const ctx = ready()
    stubFetch(ctx)
    mount({ onFallback })
    await makeMove(ctx)
    ctx.job = JOB('failed', { done: 2, dropped: { count: 6, reason: 'the start was not a stand' } })
    await waitFor(() => expect(screen.getByTestId('move-failed').textContent).toContain('could not make this move well enough'))
    // (track D2) pick up and put down have no library clip yet: their chips stay but are disabled with the plain reason;
    // Lift a frame still places through the callback
    expect((screen.getByTestId('move-fallbacks-pickUp') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('move-fallbacks-putDown') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('move-fallbacks-not-ready').textContent).toContain('The ready-made move is not available yet.')
    fireEvent.click(screen.getByTestId('move-fallbacks-lift'))
    expect(onFallback).toHaveBeenCalledWith('lift')
    ctx.job = '404' // the retry starts fresh and its first poll finds no old record
    fireEvent.click(screen.getByTestId('move-retry'))
    await waitFor(() => expect(ctx.calls.filter((u) => u.includes('/make')).length).toBe(2))
  })

  it('every try dropped (QA run 5): the reason once, what to change, the ready-made moves and Try again; no empty results', async () => {
    const ctx = ready()
    stubFetch(ctx)
    mount()
    await makeMove(ctx)
    // the box's own reason already carries the count (live: "16 of 16 dropped because ..."): it must not be said twice
    ctx.job = JOB('done', { done: 16, of: 16, round: 2, dropped: { count: 16, reason: "16 of 16 dropped because the hands didn't hold the object steadily." } })
    await waitFor(() => expect(screen.getByTestId('move-all-dropped')).toBeTruthy())
    const text = screen.getByTestId('move-all-dropped').textContent!
    expect(text).toBe("The motion computer could not make this move well enough: the hands didn't hold the object steadily. Move her closer to the piece, pick another piece, or use simpler words. Ready-made moves still work:")
    expect(text).not.toMatch(/16/)
    expect(text.match(/dropped because/g)).toBeNull()
    expect(screen.queryByTestId('move-results')).toBeNull()
    fireEvent.click(screen.getByTestId('move-retry'))
    await waitFor(() => expect(ctx.calls.filter((u) => u.includes('/make')).length).toBe(2))
  })

  it('(Fable review) a result with no words or spec to make another from: Try another says why instead of sending nothing', async () => {
    const ctx = ready()
    ctx.job = JOB('done', { tries: [{ id: 1, seed: 53, rank: 1, reason: 'steadiest hands', scores: {}, seconds: 3.8 }] })
    stubFetch(ctx)
    mount()
    const more = await screen.findByTestId('move-another') as HTMLButtonElement
    expect(more.disabled).toBe(true)
    expect(screen.getByTestId('move-no-spec').textContent).toMatch(/write the move again/)
    fireEvent.click(more)
    expect(ctx.calls.some((u) => u.includes('/make'))).toBe(false)
  })

  it('lost contact: says so and Check again re-attaches', async () => {
    const ctx = ready()
    ctx.job = JOB('lost', { message: 'Lost contact with the motion computer. It may still finish.' })
    stubFetch(ctx)
    mount()
    await waitFor(() => expect(screen.getByTestId('move-lost').textContent).toContain('Lost contact'))
    ctx.job = JOB('done', { tries: [{ id: 1, seed: 53, rank: 1, reason: 'steadiest hands', scores: {}, seconds: 3.8 }] })
    fireEvent.click(screen.getByTestId('move-check'))
    await waitFor(() => expect(screen.getByTestId('move-results')).toBeTruthy())
  })

  it('a job already on the box (e.g. after a dev-server restart) is picked up on open', async () => {
    const ctx = ready()
    ctx.job = JOB('retargeting', { tries: [{ id: 1, seed: 53, rank: 1, reason: 'steadiest hands', scores: {}, seconds: 3.8 }] })
    stubFetch(ctx)
    mount()
    await waitFor(() => expect(screen.getByTestId('move-making').textContent).toContain('Making the move'))
  })
})

describe('her made move stays with her', () => {
  const TRY = { id: 'try6', seed: 53, rank: 1, reason: 'steadiest hands', scores: {}, seconds: 3.8 }
  it('the make names her and her words; the result is shown again after the panel closes and reopens (deselect, reload)', async () => {
    const ctx = ready()
    stubFetch(ctx)
    const first = mount({ owner: 'loc-a' })
    await makeMove(ctx)
    const [, init] = vi.mocked(fetch).mock.calls.find(([u]) => String(u).includes('/make'))!
    expect(JSON.parse(String(init?.body))).toMatchObject({ owner: 'loc-a', words: WORDS })
    ctx.job = JOB('done', { tries: [TRY], owner: 'loc-a', words: WORDS, shown: 0, spec: { class: 'takeOut', sentence: 'x', seconds: 8 } })
    await waitFor(() => expect(screen.getByTestId('move-results')).toBeTruthy())
    first.unmount() // she is deselected; the page reloads
    mount({ owner: 'loc-a' })
    await waitFor(() => expect(screen.getByTestId('move-results')).toBeTruthy())
    expect((screen.getByTestId('move-another') as HTMLButtonElement).disabled).toBe(false) // the spec came back with it
    fireEvent.click(screen.getByTestId('move-new')) // Discard: the words box again
    await waitFor(() => expect(screen.getByTestId('move-words')).toBeTruthy())
    expect(ctx.calls.some((u) => u.includes('/discard'))).toBe(true)
  })

  it('another person\'s make is not hers: her panel shows the words box', async () => {
    const ctx = ready()
    ctx.job = JOB('done', { tries: [TRY], owner: 'loc-b', words: WORDS })
    stubFetch(ctx)
    mount({ owner: 'loc-a' })
    await waitFor(() => expect(ctx.calls.some((u) => u.includes('/job'))).toBe(true))
    await new Promise((r) => setTimeout(r, 100))
    expect(screen.queryByTestId('move-results')).toBeNull()
    expect(screen.getByTestId('move-words')).toBeTruthy()
  })
})

describe('the piece the words name', () => {
  it('is picked until a chip is pressed, and stays picked when a Do you mean chip rewrites the words', async () => {
    const ctx = ready()
    stubFetch(ctx)
    mount()
    fireEvent.change(screen.getByTestId('move-words'), { target: { value: 'She reaches into the hive, takes out a frame with both hands, and holds it up to look at it' } })
    await waitFor(() => expect(screen.getByTestId('move-piece-0').className).toContain('bl-on'))
    const which = screen.queryAllByTestId(/^move-which-/)
    if (which.length) fireEvent.click(which[0])
    await waitFor(() => expect((screen.getByTestId('move-make') as HTMLButtonElement).disabled).toBe(false))
    expect(screen.getByTestId('move-piece-0').className).toContain('bl-on')
  })
})

