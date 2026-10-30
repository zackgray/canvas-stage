// @vitest-environment jsdom
// "Edit this frame" in the first-frame window (owner 10-29): the box and its version strip show only while the window is open (the
// take card's thumbnail opens it: setFrameView(id, 'still')), go with the X and Esc, and their model is the draw bar's — so the typed
// words, a running edit and its result are neither lost nor sent twice by closing the window, and are still there on return. A
// version clicked in the strip is the picture shown and the frame in use (no Approve press); a pick keeps the window open; a lone
// fresh version is the frame by itself, and so is an edit that lands (not a stale one). The priced press keeps its guards. A fake fetch plays the hero server; nothing billed.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HeroStill } from '../../../shared/shotContract'
import { resetSceneJobs } from '../../../jobs/sceneJobs'
import { resetL2RStore } from '../../render/l2rStore'
import { resetCurrentTake, setCurrentTake } from '../../shoot/currentTake'
import { resetClayStore } from '../../shoot/takeClay'
import { resetFrameView, setFrameView } from '../../shoot/firstFrameView'
import { HeroStillBlock } from '../../shoot/HeroStillBlock'
import { HeroOverlay } from '../../shoot/HeroOverlay'
import { useHeroPublished } from '../../shoot/heroPublished'
import { base, clayDone, lab, serve, still, type Server } from '../../shoot/__tests__/heroStillHarness'
import { FRAME_EDIT_CREDITS } from '../../../../server/frameEdit/spec'
import { useFrameEditHolder } from '../DrawBar'

beforeEach(() => { vi.useRealTimers(); resetCurrentTake(); resetClayStore(); setCurrentTake('take-1'); sessionStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetClayStore(); resetSceneJobs(); resetL2RStore(); resetFrameView(); localStorage.clear() })

const open = (id: string, extra: Partial<HeroStill> = {}) => still(id, { role: 'opening', frame: 0, ...extra } as Partial<HeroStill>)
type Srv = Server & { hangEdit?: boolean; staleEdit?: boolean; editBodies: { stillId: string; prompt: string }[] }

/** the hero server + the edit route: an edit appends a new version (never rewrites) */
function serveAll(stills: HeroStill[], hangEdit = false): Srv {
  const s: Srv = { ...base({ opening: { present: true, startKey: 'aaaa0001' }, stills, clay: clayDone() }), editBodies: [], hangEdit }
  serve(s)
  const plain = fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).startsWith('/__lab/frame-edit')) {
      s.calls.push('POST /__lab/frame-edit')
      const body = JSON.parse(String(init?.body)) as { stillId: string; prompt: string }
      s.editBodies.push(body)
      if (s.hangEdit) return new Promise<Response>(() => {})
      s.stills = [open(`hero-e${s.stills.length}`, { editOf: body.stillId, ...(s.staleEdit ? { startKey: 'old00000' } : {}) } as Partial<HeroStill>), ...s.stills]
      return new Response(JSON.stringify({ still: s.stills[0] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return plain(url, init)
  }))
  return s
}

/** the draw bar's part: holds the edit model for the Stage's life (the bar's transport needs the engine; not mounted here) */
function Holder() { useFrameEditHolder(); return null }
/** the take's frame as the still block publishes it: what the take card opens the window on */
function Probe() {
  const o = useHeroPublished()?.overlay ?? null
  return o ? <span data-testid="probe" data-still={o.still.id} data-approved={String(o.approved)} /> : null
}
const Mount = () => <><HeroStillBlock lab={lab} kit capture={async () => new Blob(['x'])} /><Holder /><HeroOverlay /><Probe /></>
const paid = (s: Server) => s.calls.filter((c) => c === 'POST /__lab/frame-edit' || c === 'POST /__lab/hero')
const approves = (s: Server) => s.calls.filter((c) => c === 'POST /__lab/hero/approve')

/** the take card's thumbnail: opens the window on the take's frame */
async function showStill(id = 'hero-o1') {
  await waitFor(() => expect(screen.getByTestId('probe').getAttribute('data-still')).toBe(id))
  act(() => setFrameView(id, 'still'))
  return screen.findByTestId('frame-edit-text')
}

describe('"Edit this frame" in the first-frame window', () => {
  it('shows only while the window is open: the X and Esc close it, opening brings it back', async () => {
    const s = serveAll([open('hero-o1', { approved: true })])
    render(<Mount />)
    await waitFor(() => expect(screen.getByTestId('probe').getAttribute('data-approved')).toBe('true'))
    expect(screen.queryByTestId('frame-edit')).toBeNull() // closed: the 3D set, no box
    await showStill()
    expect(screen.getByTestId('hero-overlay').contains(screen.getByTestId('frame-edit-dock'))).toBe(true)
    expect(screen.getByTestId('frame-versions')).toBeTruthy()
    fireEvent.click(screen.getByTestId('hero-overlay-close'))
    expect(screen.queryByTestId('frame-edit')).toBeNull()
    await showStill()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('frame-edit')).toBeNull())
    expect(paid(s)).toEqual([])
  })

  it('the typed words survive closing with the X and with Esc; Esc in the box only leaves the box', async () => {
    serveAll([open('hero-o1', { approved: true })])
    render(<Mount />)
    fireEvent.change(await showStill(), { target: { value: 'add fog' } })
    const input = screen.getByTestId('frame-edit-text')
    input.focus()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.getByTestId('frame-edit-text')).toBeTruthy() // still on screen: only the box was left
    fireEvent.click(screen.getByTestId('hero-overlay-close'))
    expect(screen.queryByTestId('hero-overlay')).toBeNull()
    expect(((await showStill()) as HTMLInputElement).value).toBe('add fog')
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('hero-overlay')).toBeNull())
    expect(((await showStill()) as HTMLInputElement).value).toBe('add fog')
  })

  it('keeps the paid guards: the price on the press, nothing spent before it, grey with its reason, one POST per press', async () => {
    const s = serveAll([open('hero-o1', { approved: true })])
    render(<Mount />)
    await showStill()
    const btn = screen.getByTestId('frame-edit-press') as HTMLButtonElement
    expect(btn.textContent).toBe('Edit this frame')
    expect(btn.parentElement?.textContent).toMatch(new RegExp(`${FRAME_EDIT_CREDITS} cr`))
    await waitFor(() => expect(btn.disabled).toBe(true))
    expect(btn.title).toMatch(/Say the one change first/)
    fireEvent.click(btn)
    await new Promise((r) => setTimeout(r, 20))
    expect(paid(s)).toEqual([])
    fireEvent.change(screen.getByTestId('frame-edit-text'), { target: { value: 'make the car silver' } })
    fireEvent.click(screen.getByTestId('frame-edit-press'))
    await screen.findByTestId('frame-version-hero-e1')
    expect(paid(s)).toEqual(['POST /__lab/frame-edit'])
    expect(s.editBodies).toEqual([{ takeId: 'take-1', stillId: 'hero-o1', prompt: 'make the car silver' }])
    // (owner 10-29) the result is what the window shows and the frame in use at once: the free approve, the check moves to it
    await waitFor(() => expect(screen.getByTestId('hero-overlay-img').getAttribute('src')).toMatch(/hero-e1\.png$/))
    await screen.findByTestId('frame-in-use-hero-e1')
    expect(screen.queryByTestId('frame-in-use-hero-o1')).toBeNull()
    expect(approves(s)).toEqual(['POST /__lab/hero/approve'])
    expect(s.stills.find((x) => x.approved)?.id).toBe('hero-e1')
    expect(paid(s)).toEqual(['POST /__lab/frame-edit']) // one paid press, the approval free
  })

  it('an edit that lands stale is shown but never made the frame in use by itself', async () => {
    const s = serveAll([open('hero-o1', { approved: true })])
    s.staleEdit = true
    render(<Mount />)
    fireEvent.change(await showStill(), { target: { value: 'make the car silver' } })
    fireEvent.click(screen.getByTestId('frame-edit-press'))
    await screen.findByTestId('frame-stale-hero-e1')
    await act(async () => { await new Promise((r) => setTimeout(r, 40)) })
    expect(screen.getByTestId('frame-in-use-hero-o1')).toBeTruthy()
    expect(approves(s)).toEqual([])
  })

  it('a running edit survives closing and reopening: its line on return, never a second POST', async () => {
    const s = serveAll([open('hero-o1', { approved: true })], true)
    render(<Mount />)
    fireEvent.change(await showStill(), { target: { value: 'remove the sign' } })
    fireEvent.click(screen.getByTestId('frame-edit-press'))
    await screen.findByTestId('frame-edit-phase')
    fireEvent.click(screen.getByTestId('hero-overlay-close'))
    expect(screen.queryByTestId('frame-edit')).toBeNull()
    act(() => setFrameView('hero-o1', 'still'))
    expect((await screen.findByTestId('frame-edit-phase')).textContent).toMatch(/Editing the frame/)
    expect(screen.queryByTestId('frame-edit-press')).toBeNull()
    await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
    expect(paid(s)).toEqual(['POST /__lab/frame-edit'])
  })

  it('clicking a version shows it full size; that one click makes it the frame in use and the window stays open', async () => {
    const s = serveAll([open('hero-o2'), open('hero-o1', { approved: true })])
    render(<Mount />)
    await showStill()
    expect(screen.getByTestId('hero-overlay-img').getAttribute('src')).toMatch(/hero-o1\.png$/)
    fireEvent.click(screen.getByTestId('frame-show-hero-o2'))
    expect(screen.getByTestId('hero-overlay-img').getAttribute('src')).toMatch(/hero-o2\.png$/)
    expect(screen.getByTestId('frame-show-hero-o2').getAttribute('aria-pressed')).toBe('true')
    await waitFor(() => expect(approves(s)).toHaveLength(1))
    await screen.findByTestId('frame-in-use-hero-o2')
    await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
    expect(screen.getByTestId('hero-overlay')).toBeTruthy() // the window holds on across the pick
    expect(screen.getByTestId('hero-overlay-img').getAttribute('src')).toMatch(/hero-o2\.png$/)
    expect(paid(s)).toEqual([])
  })

  // owner 10-29: no Approve. A lone drawn frame is the frame by itself; an edit of it, used from the strip, is the take's frame at once
  it('a lone fresh version is picked by itself, once; an edit that lands is the take\'s frame at once, and a click switches back', async () => {
    const s = serveAll([open('hero-o1')])
    render(<Mount />)
    await waitFor(() => expect(screen.getByTestId('probe').getAttribute('data-approved')).toBe('true'))
    expect(approves(s)).toHaveLength(1)
    expect(s.stills.find((x) => x.approved)?.id).toBe('hero-o1')
    fireEvent.change(await showStill(), { target: { value: 'remove the helmet from the cockpit' } })
    fireEvent.click(screen.getByTestId('frame-edit-press'))
    // (owner 10-29) the edit that lands is the take's frame at once, the window staying open across the swap
    await waitFor(() => expect(screen.getByTestId('probe').getAttribute('data-still')).toBe('hero-e1')) // read again at once
    await waitFor(() => expect(screen.getByTestId('probe').getAttribute('data-approved')).toBe('true'))
    await screen.findByTestId('frame-in-use-hero-e1')
    expect(screen.getByTestId('hero-overlay')).toBeTruthy()
    expect(approves(s)).toHaveLength(2)
    // a click on the earlier version still switches back
    fireEvent.click(screen.getByTestId('frame-show-hero-o1'))
    await screen.findByTestId('frame-in-use-hero-o1')
    expect(approves(s)).toHaveLength(3)
    expect(paid(s)).toEqual(['POST /__lab/frame-edit'])
  })

  it('no Approve press in the window, and two fresh versions are not picked by themselves', async () => {
    const s = serveAll([open('hero-o2'), open('hero-o1')])
    render(<Mount />)
    await waitFor(() => expect(screen.getByTestId('probe')).toBeTruthy())
    act(() => setFrameView(screen.getByTestId('probe').getAttribute('data-still')!, 'still'))
    await screen.findByTestId('frame-show-hero-o1')
    await screen.findByTestId('frame-show-hero-o2')
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    const win = screen.getByTestId('hero-overlay')
    expect([...win.querySelectorAll('button')].filter((b) => /approve/i.test(b.textContent ?? ''))).toEqual([])
    expect(screen.queryByTestId(/^frame-in-use-/)).toBeNull()
    expect(approves(s)).toEqual([])
  })
})
