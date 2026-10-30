// @vitest-environment jsdom
// The still judge under the lightbox: staged people at 100 % beside their cards, the priced face / prop redraws sent once and
// landing as Keep / Discard candidates, Keep moving to the new still. Approve is one plain click — the flagging is information,
// never a gate (owner decision 2026-10-28).
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PassCandidate } from '../../shared/passContract'
import type { KitStill } from '../../../server/hero/kitSpec'
import { StillJudgePanel } from './StillJudge'
import type { Judge } from './useStillJudge'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const still = (over: Partial<KitStill & { stale: boolean }> = {}) => ({ id: 'hero-a1', takeId: 'take-1', startKey: 'k', png: '/lab-assets/shots/take-1/hero/hero-a1.png', seed: 3, jobId: 'j', credits: 21,
  approved: false, createdAt: '2026-10-25T10:00:00.000Z', role: 'opening' as const, frame: 0, layout: { score: 0.5, ok: true, message: null }, stale: false, ...over })
const judge = (over: Partial<Judge> = {}): Judge => ({ stillId: 'hero-a1', frame: 0, kit: true, width: 1920, height: 1088, layout: null, flagged: true, prices: { face: 3, prop: 3 }, redrawnInto: null,
  people: [
    { entity: 'hero', name: 'Ana', cardId: 'ana', cardUrl: '/lab-assets/cast/ana/face.png', box: { x: 100, y: 50, w: 180, h: 400 }, face: { x: 150, y: 60, w: 40, h: 30 }, status: 'ok', match: 0.55 },
    { entity: 'extra:0:0', name: 'Tom', cardId: 'tom', cardUrl: '/lab-assets/cast/tom/face.png', box: { x: 900, y: 80, w: 160, h: 380 }, face: { x: 950, y: 90, w: 36, h: 28 }, status: 'off', match: 0.12 }],
  pieces: [{ tag: 'trunk', line: 'a trunk', tileUrl: '/lab-assets/locations/loc-1/bible/elements/trunk.png', box: { x: 600, y: 700, w: 300, h: 200 } }], ...over })
const candidate = (over: Partial<PassCandidate> = {}): PassCandidate => ({ id: 'pass-1', takeId: 'take-1', pass: 'face', target: { kind: 'still', stillId: 'hero-a1' }, subject: 'tom', box: { x: 900, y: 40, w: 140, h: 120 },
  state: 'candidate', beforeUrl: '/b.png', afterUrl: '/a.png', beforeCropUrl: '/bc.png', afterCropUrl: '/ac.png', jobId: 'job-1', costCredits: 3, createdAt: '2026-10-25T10:01:00.000Z', ...over })

function serve(o: { judge?: Judge; candidates?: PassCandidate[] } = {}) {
  const calls: { url: string; body?: unknown }[] = []
  let j = o.judge ?? judge()
  let list = o.candidates ?? []
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    calls.push({ url: `${init?.method ?? 'GET'} ${u.split('?')[0]}`, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (u.startsWith('/__lab/hero/judge')) return json(j)
    if (u.startsWith('/__lab/hero/redraw')) { list = [candidate({ state: 'running', afterUrl: null })]; await new Promise((r) => setTimeout(r, 20)); list = [candidate()]; return json({ candidate: list[0] }) }
    if (u === '/__lab/passes/keep') { list = [candidate({ state: 'kept' })]; j = { ...j, redrawnInto: 'hero-a1-r1' }; return json({ candidate: list[0] }) }
    if (u.startsWith('/__lab/passes')) return json({ candidates: list })
    return json({ error: 'no' }, 404)
  }))
  return calls
}

describe('StillJudgePanel', () => {
  it('each staged person at 100 % beside their own card; a flagged person is said, and Approve is one plain click', async () => {
    const calls = serve()
    const onApprove = vi.fn()
    render(<StillJudgePanel still={still()} onApprove={onApprove} />)
    await screen.findByTestId('people-strip')
    const crop = screen.getByTestId('person-crop-extra:0:0').firstElementChild as HTMLElement
    expect([crop.style.width, crop.style.height, crop.style.backgroundPosition]).toEqual(['160px', '380px', '-900px -80px']) // its own pixels, never scaled
    expect(screen.getByTestId('person-card-extra:0:0').getAttribute('src')).toBe('/lab-assets/cast/tom/face.png')
    expect(screen.getByTestId('person-verdict-extra:0:0').textContent).toMatch(/Tom Not where the 3D set puts them/)
    expect(screen.getByTestId('person-verdict-extra:0:0').textContent).not.toMatch(/0\.12/) // the number is in the tooltip only
    expect(screen.getByTestId('judge-flag').textContent).toBe('One person needs a look at 100 %.')
    fireEvent.click(screen.getByTestId('judge-approve'))
    expect(onApprove).toHaveBeenCalledWith('hero-a1') // the flag is information; it never gates the press
    expect(calls.filter((c) => c.url.startsWith('POST'))).toEqual([])
  })

  it('a flagged still (layout 0.28): the layout warning is said, and Approve approves on one click — a double press still sends one', async () => {
    serve({ judge: judge({ flagged: false, people: [] }) })
    let approved = false
    const onApprove = vi.fn(async () => { await new Promise((r) => setTimeout(r, 10)); approved = true })
    const flaggedStill = () => still({ approved, layout: { score: 0.28, ok: false, message: 'x' } })
    const { rerender } = render(<StillJudgePanel still={flaggedStill()} onApprove={onApprove} />)
    await waitFor(() => expect(screen.getByTestId('judge-approve').textContent).toBe('Approve'))
    expect(screen.getByTestId('judge-layout').textContent).toMatch(/may be missing the hero or have moved part of the set/)
    const btn = screen.getByTestId('judge-approve')
    fireEvent.click(btn); fireEvent.click(btn)
    await waitFor(() => expect(approved).toBe(true))
    rerender(<StillJudgePanel still={flaggedStill()} onApprove={onApprove} />)
    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('judge-approved').textContent).toBe('approved')
  })

  it('an unflagged still approves on one press, and a double press while it is in flight sends one request', async () => {
    serve({ judge: judge({ flagged: false, people: [] }) })
    let release = () => {}
    const onApprove = vi.fn(() => new Promise<void>((r) => { release = r }))
    render(<StillJudgePanel still={still()} onApprove={onApprove} />)
    await waitFor(() => expect(screen.getByTestId('judge-approve').textContent).toBe('Approve'))
    const btn = screen.getByTestId('judge-approve')
    act(() => { btn.click(); btn.click() }) // both presses land before React re-renders
    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('judge-approve-ask')).toBeNull()
    await act(async () => { release() })
  })

  it('a server refusal of the approve shows in the panel, and the panel offers Approve again', async () => {
    serve({ judge: judge({ flagged: false, people: [] }) })
    const props = (err: string | null) => ({ still: still(), onApprove: async () => {}, approveError: err })
    const { rerender } = render(<StillJudgePanel {...props(null)} />)
    await waitFor(() => expect(screen.getByTestId('judge-approve').textContent).toBe('Approve'))
    expect(screen.queryByTestId('judge-approve-error')).toBeNull()
    fireEvent.click(screen.getByTestId('judge-approve'))
    await waitFor(() => expect(screen.getByTestId('judge-approve').textContent).toBe('Approve'))
    rerender(<StillJudgePanel {...props('That still is stale')} />)
    expect(screen.getByTestId('judge-approve-error').textContent).toBe('That still is stale')
  })

  it('Approve is live at once: one click approves while the people are still being checked', async () => {
    serve({ judge: judge({ flagged: false, people: [judge().people[0]] }) })
    const onApprove = vi.fn()
    render(<StillJudgePanel still={still()} onApprove={onApprove} />)
    const btn = screen.getByTestId('judge-approve')
    expect(btn.hasAttribute('disabled')).toBe(false) // never dim, never a wait
    fireEvent.click(btn)
    expect(onApprove).toHaveBeenCalledTimes(1)
  })

  it('Redraw face from card is priced, sent once, and lands as a Keep / Discard candidate; Keep moves to the new still', async () => {
    const calls = serve()
    const onKept = vi.fn()
    render(<StillJudgePanel still={still()} onApprove={() => {}} onKept={onKept} />)
    const btn = await screen.findByTestId('redraw-face-extra:0:0')
    expect(btn.parentElement?.textContent).toMatch(/Redraw face from card.*3 cr/)
    expect(screen.getByTestId('redraw-prop-trunk').parentElement?.textContent).toMatch(/Redraw from board tile.*3 cr/)
    fireEvent.click(btn)
    await screen.findByTestId('pass-candidate')
    expect(calls.filter((c) => c.url === 'POST /__lab/hero/redraw')).toEqual([{ url: 'POST /__lab/hero/redraw', body: { takeId: 'take-1', stillId: 'hero-a1', pass: 'face', subject: 'extra:0:0' } }])
    // Keep unlocks once both 100 % crops have shown
    for (const k of ['pass-before', 'pass-after']) act(() => { fireEvent.load(screen.getByTestId(k)) })
    fireEvent.click(screen.getByTestId('pass-keep'))
    await waitFor(() => expect(onKept).toHaveBeenCalledWith('hero-a1-r1'))
  })

  it('a stale still, or one already redrawn into a newer still: no redraws, and a stale one cannot be approved', async () => {
    serve({ judge: judge({ redrawnInto: 'hero-a1-r1' }) })
    const { unmount } = render(<StillJudgePanel still={still()} onApprove={() => {}} />)
    expect((await screen.findByTestId('redraw-face-hero')).hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('judge-redrawn')).toBeTruthy()
    unmount()
    serve()
    render(<StillJudgePanel still={still({ stale: true })} onApprove={() => {}} />)
    expect((await screen.findByTestId('redraw-prop-trunk')).hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('judge-approve').hasAttribute('disabled')).toBe(true)
  })

  it('the judge could not be read: says so, and Approve is still one plain click', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => new Response(JSON.stringify(String(u).startsWith('/__lab/passes') ? { candidates: [] } : { error: 'boom' }), { status: String(u).startsWith('/__lab/passes') ? 200 : 500 })))
    const onApprove = vi.fn()
    render(<StillJudgePanel still={still()} onApprove={onApprove} />)
    expect((await screen.findByTestId('judge-error')).textContent).toBe('boom')
    fireEvent.click(screen.getByTestId('judge-approve'))
    expect(onApprove).toHaveBeenCalledTimes(1)
  })
})
