// @vitest-environment jsdom
// Free-text moves (EXPERIMENTAL): words the verb table does not know are sent as they are written, the hint line lists what
// works, the picker shows the best few tries each playable before choosing, "none usable" has a way out, and no call leaves the
// local motion routes (nothing priced).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { planMove } from '../../../../stage3d/moves/index.ts'
import { DescribeMovePanel } from '../DescribeMovePanel'
import { freeSpec, withFreeText } from '../freeText'

const FREE = { class: 'gesture', sentence: 'A person stands still, then does a cartwheel.', seconds: 6, keys: [], phases: [], free: true }
const TRY = (n: number) => ({ id: `try${n}`, seed: n, rank: n, reason: 'cleanest try', scores: {}, seconds: 3 })
const JOB = (over: Record<string, unknown> = {}) => ({ id: 'job-1', stage: 'done', done: 8, of: 8, round: 1, tries: [TRY(1), TRY(2), TRY(3), TRY(4)], dropped: { count: 0, reason: '' }, spec: FREE, words: 'does a cartwheel', shown: 0, ...over })

type Ctx = { job: Record<string, unknown> | '404'; calls: string[]; made: Record<string, unknown>[]; kept: Record<string, unknown>[] }

function stubFetch(ctx: Ctx) {
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    ctx.calls.push(url)
    if (url.includes('/__lab/motion/health')) return json({ state: 'ready' })
    if (url.includes('/__lab/motion/make')) { ctx.made.push(JSON.parse(String(init?.body))); return json({ jobId: 'job-1' }) }
    if (url.includes('/__lab/motion/job')) return ctx.job === '404' ? json({}, 404) : json(ctx.job)
    if (url.includes('/__lab/motion/discard')) { ctx.job = '404'; return json({}) }
    if (url.includes('/__lab/motion/keep')) { ctx.kept.push(JSON.parse(String(init?.body))); return json({ id: 'gen:abc', clip: { out: 6 } }) }
    throw new Error(`unexpected fetch ${url}`)
  }))
}
const ctxOf = (job: Ctx['job'] = '404'): Ctx => ({ job, calls: [], made: [], kept: [] })
const mount = (extra = {}) => render(<DescribeMovePanel at={[0, 0]} kit={[]} pollMs={50} {...extra} />)

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('free text planning', () => {
  it('words the verb table does not know become a free gesture spec, written as the person typed them', () => {
    const plan = withFreeText(planMove({ words: 'does a cartwheel' }), 'does a cartwheel')
    expect(plan.kind).toBe('spec')
    expect(plan.kind === 'spec' && plan.spec).toMatchObject({ class: 'gesture', free: true, keys: [], sentence: 'A person stands still, then does a cartwheel.' })
  })

  it('sitting down on the ground passes; sitting on a piece, animals and two-person moves stay refused', () => {
    const go = (w: string) => withFreeText(planMove({ words: w }), w).kind
    expect(go('sits down on the ground')).toBe('spec')
    expect(go('sits on the hive')).toBe('refused')
    expect(go('hugs a dog')).toBe('refused')
    expect(go('squats for 30 seconds')).toBe('refused')
    expect(freeSpec('squats for 30 seconds')).toBeNull()
  })

  it('a known move keeps its table spec and is not free', () => {
    const w = 'waves'
    const plan = withFreeText(planMove({ words: w }), w)
    expect(plan.kind === 'spec' && (plan.spec as { free?: boolean }).free).toBeUndefined()
  })
})

describe('free text in the panel', () => {
  it('labels the path EXPERIMENTAL, lists what works, and sends the free words (local routes only)', async () => {
    const ctx = ctxOf(); stubFetch(ctx); mount()
    expect(screen.getByTestId('move-hint').textContent).toMatch(/squat.*kneel.*crouch.*stumble.*cartwheel.*hop/)
    expect(screen.getByTestId('move-hint').textContent).not.toMatch(/spin|kick/i)
    fireEvent.change(screen.getByTestId('move-words'), { target: { value: 'does a cartwheel' } })
    await waitFor(() => expect((screen.getByTestId('move-make') as HTMLButtonElement).disabled).toBe(false))
    expect(screen.getByTestId('move-experimental').textContent).toBe('EXPERIMENTAL')
    fireEvent.click(screen.getByTestId('move-make'))
    await waitFor(() => expect(ctx.made).toHaveLength(1))
    expect(ctx.made[0].spec).toMatchObject({ free: true, sentence: FREE.sentence })
    expect(ctx.calls.every((u) => u.startsWith('/__lab/motion/'))).toBe(true)
    expect(ctx.calls.some((u) => /price|credit|comfy|generate/i.test(u))).toBe(false)
  })

  it('a hint chip fills the words box', async () => {
    stubFetch(ctxOf()); mount()
    fireEvent.click(screen.getAllByTestId('move-hint-move')[0])
    expect((screen.getByTestId('move-words') as HTMLTextAreaElement).value).toBe('squats down')
  })

  it('a finished free make is a picker: each option plays before it is chosen', async () => {
    const onPlayHere = vi.fn(); const onUseThisOne = vi.fn()
    const ctx = ctxOf(JOB()); stubFetch(ctx); mount({ onPlayHere, onUseThisOne })
    await waitFor(() => expect(screen.getAllByTestId('move-option')).toHaveLength(4))
    expect(screen.getByTestId('move-experimental')).toBeTruthy()
    fireEvent.click(screen.getAllByTestId('move-option-play')[2])
    await waitFor(() => expect(onPlayHere).toHaveBeenCalled())
    expect(ctx.kept[0]).toMatchObject({ try: 'try3' })
    expect(onUseThisOne).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByTestId('move-option-use')[1])
    await waitFor(() => expect(onUseThisOne).toHaveBeenCalled())
    expect(ctx.kept[1]).toMatchObject({ try: 'try2' })
  })

  it('shows at most five options', async () => {
    stubFetch(ctxOf(JOB({ tries: [1, 2, 3, 4, 5, 6, 7].map(TRY) }))); mount()
    await waitFor(() => expect(screen.getAllByTestId('move-option')).toHaveLength(5))
  })

  it('none usable: no tries says so and offers other words; the picker always has the way out', async () => {
    const ctx = ctxOf(JOB({ tries: [] })); stubFetch(ctx); mount()
    await waitFor(() => expect(screen.getByTestId('move-none')).toBeTruthy())
    fireEvent.click(screen.getByTestId('move-new'))
    await waitFor(() => expect(screen.getByTestId('move-words')).toBeTruthy())
    expect(ctx.calls.some((u) => u.includes('/discard'))).toBe(true)
  })

  it('a table make still shows the single best move, not the picker', async () => {
    stubFetch(ctxOf(JOB({ spec: { ...FREE, free: undefined } }))); mount()
    await waitFor(() => expect(screen.getByTestId('move-results')).toBeTruthy())
    expect(screen.queryByTestId('move-picker')).toBeNull()
  })
})
