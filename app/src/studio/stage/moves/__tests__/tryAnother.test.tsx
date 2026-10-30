// @vitest-environment jsdom
// Try another never does nothing: on a finished make whose last ranked try is already on show (the owner's record: stage done,
// three tries, shown 2, one kept), it starts a fresh free round from the make's own spec and the working state shows at once;
// with a next-best left it shows that one; when the motion computer is busy it says so in plain words.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KitItem } from '../../../../stage3d/contract'
import { DescribeMovePanel } from '../DescribeMovePanel'

const OWNER = 'loc-a'
const HIVE: KitItem = { kind: 'crates', args: [1, 1], at: [0.3, 0.35], label: 'Hive', pieceTag: 'prop:hive' }
const SPEC = { class: 'takeOut', sentence: 'A person stands still, then bends at the waist and reaches into a box', seconds: 8, keys: [] }
const tries = [{ id: 'try1', seed: 1, rank: 1, reason: 'a', scores: {}, seconds: 3.7 }, { id: 'try7', seed: 7, rank: 2, reason: 'b', scores: {}, seconds: 3.7 },
  { id: 'try3', seed: 3, rank: 3, reason: 'c', scores: {}, seconds: 3.7 }]
/** the owner's record as /job answers it */
const DONE = (shown: number) => ({ id: '794a3bbb997b', stage: 'done', done: 8, of: 8, round: 1, tries, dropped: { count: 1, reason: '1 of 8 dropped because the move sagged at the end.' },
  startedAt: 1, owner: OWNER, words: 'takes out an object out of it', shown, spec: SPEC })

function serve(o: { job: Record<string, unknown>; makeStatus?: number }) {
  const calls: { url: string; body?: unknown }[] = []
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (url.includes('/health')) return json({ state: 'ready', secondsPerTry: 3.7 })
    if (url.includes('/make')) {
      if (o.makeStatus) return json({ error: 'busy' }, o.makeStatus)
      o.job = { id: 'job-2', stage: 'generating 1/8', done: 0, of: 8, round: 1, tries: [], dropped: { count: 0, reason: '' }, startedAt: Date.now(), owner: OWNER }
      return json({ jobId: 'job-2' })
    }
    if (url.includes('/job')) return json(o.job)
    if (url.includes('/shown')) { o.job = { ...o.job, shown: JSON.parse(String(init?.body)).shown }; return json({}) }
    if (url.includes('/keep')) return json({ id: 'gen:x', clip: { out: 8 } })
    return json({})
  }))
  return calls
}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const mount = () => render(<DescribeMovePanel at={[0, 0]} kit={[HIVE]} pollMs={50} owner={OWNER} />)

describe('Try another', () => {
  it('on the last try: a fresh round from the make\'s own spec, and the working state at once', async () => {
    const calls = serve({ job: DONE(2) })
    mount()
    const btn = await screen.findByTestId('move-another') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    fireEvent.click(btn)
    await waitFor(() => expect(screen.getByTestId('move-making')).toBeTruthy())
    const make = calls.find((c) => c.url.includes('/make'))!
    expect(make.body).toMatchObject({ spec: SPEC, owner: OWNER })
  })

  it('with a next-best left it shows that one: it plays here at once and the line says it is another way', async () => {
    const calls = serve({ job: DONE(0) })
    const onPlayHere = vi.fn()
    render(<DescribeMovePanel at={[0, 0]} kit={[HIVE]} pollMs={50} owner={OWNER} onPlayHere={onPlayHere} />)
    expect((await screen.findByTestId('move-result-line')).textContent).toBe('Her move is ready.')
    fireEvent.click(screen.getByTestId('move-another'))
    await waitFor(() => expect(calls.find((c) => c.url.includes('/shown'))?.body).toMatchObject({ shown: 1 }))
    await waitFor(() => expect(calls.find((c) => c.url.includes('/keep'))?.body).toMatchObject({ try: 'try7' })) // the next-best, played
    await waitFor(() => expect(onPlayHere).toHaveBeenCalled())
    expect(screen.getByTestId('move-result-line').textContent).toBe('Here is another way she can do it.')
    expect(calls.some((c) => c.url.includes('/make'))).toBe(false)
  })

  it('when the motion computer is busy, it says so in plain words', async () => {
    serve({ job: DONE(2), makeStatus: 409 })
    mount()
    fireEvent.click(await screen.findByTestId('move-another'))
    await waitFor(() => expect(screen.getByTestId('move-another-why').textContent).toMatch(/making another move/))
  })
})
