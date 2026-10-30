// @vitest-environment jsdom
// The Stage's take list: each take's name, picture and state; a click switches to it through Render's own pick (the take on show,
// remembered for the world) and puts the camera where it starts; rename and Discard (asked first) on the take on show; + New take
// starts an open take from what is on screen and records nothing (asking first over an unlocked recording); the open row stays
// through picks of locked takes and brings the scene's setup back; the take being filmed shows as open. Fake server, nothing paid.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { resetSceneJobs } from '../../../jobs/sceneJobs'
import type { TakeBoardRow } from '../../../shared/takeWordsContract'
import { resetL2RStore } from '../../render/l2rStore'
import { currentTakeId, resetCurrentTake, setCurrentTake } from '../../shoot/currentTake'
import { take } from '../../shoot/__tests__/heroStillHarness'
import { readTakePick } from '../../shoot/takePick'
import { resetTakeBoard } from '../../shoot/takeBoard'
import { resetLockedTakes } from '../../shoot/worldTakes'
import { openTakeOn, resetOpenTake } from '../../shoot/openTake'
import { resetTakeShow, sceneWalkOn } from '../../shoot/takeShow'
import { resetStageMemo, stageMemo } from '../stageMemory'
import { TakeList } from '../TakeList'

const row = (id: string, o: Partial<TakeBoardRow> = {}): TakeBoardRow => ({ id, name: null, thumb: null, state: 'locked', words: 'w', own: true, sceneChanged: false, ...o })
let rows: TakeBoardRow[] = []
let calls: string[] = []
const takes = [take({ id: 'take-2026-10-28T10-00-00-000', samples: [{ t: 0, position: [5, 1.6, 2], quaternion: [0, 0, 0, 1], focal: 50, focus: 3 }] }), take({ id: 'take-2026-10-28T09-00-00-000' })]

function serve() {
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const p = String(url).split('?')[0]
    calls.push(`${init?.method ?? 'GET'} ${p}${init?.body ? ` ${init.body}` : ''}`)
    if (p === '/__lab/takes/board') return json({ rows, scenePrompt: '' })
    if (p === '/__lab/takes/rename') { const b = JSON.parse(String(init!.body)); rows = rows.map((r) => (r.id === b.takeId ? { ...r, name: b.name || null } : r)); return json({ take: takes[0] }) }
    if (p === '/__lab/takes/discard') { const b = JSON.parse(String(init!.body)); rows = rows.filter((r) => r.id !== b.takeId); return json({ id: b.takeId, kept: 'x' }) }
    if (p === '/__lab/takes') return json({ takes })
    return json({})
  }))
}
const engine = () => ({ deck: { recording: false, take: null as object | null }, toggleRecording: vi.fn(), takeOver: vi.fn(), focus: 0 })
const labOf = (e: ReturnType<typeof engine>) => ({ s: { source: 'loc-1' }, op: { engine: e, mode: 'operator' } }) as unknown as ProjectionLabState

beforeEach(() => {
  calls = []; rows = [row(takes[0].id, { name: 'Wide', state: 'drawn', thumb: '/lab-assets/shots/a/hero/hero-1.png' }), row(takes[1].id, { state: 'rendered' })]
  resetCurrentTake(); resetLockedTakes(); resetTakeBoard(); resetL2RStore(); resetStageMemo(); resetOpenTake(); resetTakeShow(); localStorage.clear(); serve()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetLockedTakes(); resetTakeBoard(); resetL2RStore(); resetSceneJobs(); resetOpenTake(); resetTakeShow(); localStorage.clear() })

describe('the take list', () => {
  it("shows each take's name, picture and state", async () => {
    render(<TakeList lab={labOf(engine())} />)
    const a = await screen.findByTestId(`take-row-${takes[0].id}`)
    expect(a.textContent).toMatch(/Wide.*drawn/)
    expect(a.querySelector('img')?.getAttribute('src')).toBe('/lab-assets/shots/a/hero/hero-1.png')
    expect(screen.getByTestId(`take-state-${takes[1].id}`).textContent).toBe('rendered')
  })

  it("a click switches to the take through Render's pick, and the camera goes to where it starts", async () => {
    const e = engine()
    render(<TakeList lab={labOf(e)} />)
    await waitFor(() => expect(calls.some((c) => c === 'GET /__lab/takes')).toBe(true))
    fireEvent.click(await screen.findByTestId(`take-pick-${takes[0].id}`))
    expect(currentTakeId()).toBe(takes[0].id)
    expect(readTakePick('loc-1')).toBe(takes[0].id) // remembered for the world, as Render's own pick does
    expect(e.takeOver).toHaveBeenCalledTimes(1)
    expect(e.takeOver.mock.calls[0][0].toArray()).toEqual([5, 1.6, 2])
    expect(stageMemo().cue).toBe('take')
  })

  it('nothing switches while the camera films; the take being filmed shows as open', async () => {
    const e = engine(); e.deck.recording = true
    render(<TakeList lab={labOf(e)} />)
    expect((await screen.findByTestId('take-row-open')).textContent).toMatch(/New take.*open/)
    expect((screen.getByTestId(`take-pick-${takes[0].id}`) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('take-add') as HTMLButtonElement).disabled).toBe(true)
  })

  it('+ New take records nothing: the open row is on show, a locked take shows again on a click, the open row brings the scene back', async () => {
    const e = engine()
    setCurrentTake(takes[0].id, true)
    render(<TakeList lab={labOf(e)} />)
    const add = await screen.findByTestId('take-add')
    expect(add.title).toBe("Starts a new take from what's on screen; nothing is recorded until you press Record. Your saved takes stay as they are.")
    await act(async () => { fireEvent.click(add) })
    expect(e.toggleRecording).not.toHaveBeenCalled()
    expect(currentTakeId()).toBeNull()
    expect(screen.getByTestId('take-pick-open').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId(`take-pick-${takes[0].id}`).getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByTestId(`take-pick-${takes[0].id}`)) // back to the locked take: it shows, the open row stays
    expect(currentTakeId()).toBe(takes[0].id)
    expect(sceneWalkOn('loc-1')).toBe(false)
    await waitFor(() => expect(screen.getByTestId('take-pick-open').getAttribute('aria-pressed')).toBe('false'))
    expect(screen.getByTestId(`take-pick-${takes[0].id}`).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByTestId('take-pick-open')) // the scene's setup comes back on show, no take current
    expect(currentTakeId()).toBeNull()
    expect(sceneWalkOn('loc-1')).toBe(true)
    await waitFor(() => expect(screen.getByTestId('take-pick-open').getAttribute('aria-pressed')).toBe('true'))
    fireEvent.click(screen.getByTestId('take-discard-open')) // discarded: the row goes
    expect(openTakeOn('loc-1')).toBe(false)
    await waitFor(() => expect(screen.queryByTestId('take-row-open')).toBeNull())
  })

  it('the open row is kept for the world across a reload', async () => {
    setCurrentTake(takes[0].id, true)
    render(<TakeList lab={labOf(engine())} />)
    await act(async () => { fireEvent.click(await screen.findByTestId('take-add')) })
    cleanup(); resetOpenTake() // the page's memory gone, the browser's kept
    localStorage.setItem('canvas-stage.open-take.loc-1', '1'); localStorage.setItem('canvas-stage.take-aside.loc-1', takes[0].id)
    render(<TakeList lab={labOf(engine())} />)
    expect((await screen.findByTestId('take-pick-open')).getAttribute('aria-pressed')).toBe('true')
    expect(sceneWalkOn('loc-1')).toBe(true)
  })

  it('over an unlocked recording, + New take asks first; Cancel keeps it, New take drops it', async () => {
    const e = engine(); const rec = {}; e.deck.take = rec
    render(<TakeList lab={labOf(e)} />)
    fireEvent.click(await screen.findByTestId('take-add'))
    expect(screen.getByTestId('take-add-ask').textContent).toMatch(/Start a new take\? The unlocked recording will be dropped\./)
    fireEvent.click(screen.getByTestId('take-add-ask-no'))
    expect(e.deck.take).toBe(rec)
    fireEvent.click(screen.getByTestId('take-add'))
    await act(async () => { fireEvent.click(screen.getByTestId('take-add-ask-yes')) })
    expect(e.deck.take).toBeNull()
    expect(e.toggleRecording).not.toHaveBeenCalled()
    expect(openTakeOn('loc-1')).toBe(true)
  })

  it('the take on show is renamed and discarded (asked first)', async () => {
    setCurrentTake(takes[1].id)
    render(<TakeList lab={labOf(engine())} />)
    expect(screen.queryByTestId(`take-rename-${takes[0].id}`)).toBeNull() // only the take on show
    fireEvent.click(await screen.findByTestId(`take-rename-${takes[1].id}`))
    const input = screen.getByTestId(`take-name-${takes[1].id}`)
    fireEvent.change(input, { target: { value: 'Close on her' } })
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }) })
    await waitFor(() => expect(calls).toContain(`POST /__lab/takes/rename {"takeId":"${takes[1].id}","name":"Close on her"}`))
    await waitFor(() => expect(screen.getByTestId(`take-row-${takes[1].id}`).textContent).toMatch(/Close on her/))
    fireEvent.click(screen.getByTestId(`take-discard-${takes[1].id}`))
    expect(calls.some((c) => c.startsWith('POST /__lab/takes/discard'))).toBe(false) // asked first
    fireEvent.click(within(screen.getByTestId(`take-discard-ask-${takes[1].id}`), 'Discard'))
    await waitFor(() => expect(calls.some((c) => c.startsWith('POST /__lab/takes/discard'))).toBe(true))
    expect(currentTakeId()).toBeNull()
    await waitFor(() => expect(screen.queryByTestId(`take-row-${takes[1].id}`)).toBeNull())
  })
})

const within = (el: HTMLElement, text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === text)!
