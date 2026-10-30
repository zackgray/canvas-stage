// @vitest-environment jsdom
// "Edit this frame" (owner 10-28; under the full-screen still since 10-29, frameEditDock.test.tsx): the priced press (nothing spent before the click, the price beside the verb), one
// edit at a time (the pill, not the press), the free local camera/zoom warning, the version strip (nothing overwritten, pick = the
// existing approve press, edit from any version). A fake fetch plays the hero server; no Comfy call, nothing billed.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSceneJobs } from '../../../jobs/sceneJobs'
import { resetL2RStore } from '../../render/l2rStore'
import { resetCurrentTake, setCurrentTake } from '../../shoot/currentTake'
import { resetClayStore } from '../../shoot/takeClay'
import { base, serve, still, type Server } from '../../shoot/__tests__/heroStillHarness'
import { FRAME_EDIT_CREDITS } from '../../../../server/frameEdit/spec'
import { FrameEditPanel } from '../FrameEditPanel'
import { FrameVersionsStrip } from '../FrameVersionsStrip'
import { useFrameEdit } from '../useFrameEdit'

beforeEach(() => { vi.useRealTimers(); resetCurrentTake(); resetClayStore(); setCurrentTake('take-1'); sessionStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetClayStore(); resetSceneJobs(); resetL2RStore(); localStorage.clear() })

/** the panel + strip the still view mounts (FrameEditDock), driven by the real hook (the transport needs the projection engine; not touched here) */
function FrameEditHost() {
  const model = useFrameEdit()
  return (<><FrameEditPanel model={model} /><FrameVersionsStrip model={model} /></>)
}

type Srv = Server & { hangEdit?: boolean; editBodies: object[] }
const srv = (over: Partial<Server> = {}, extra: Partial<Pick<Srv, 'hangEdit'>> = {}): Srv => ({ ...base(over), editBodies: [], ...extra })

/** the hero server + the edit route, faked on the harness's shapes: an edit appends a new version (never rewrites), approve flips */
function serveFrameEdit(s: Srv) {
  s.editBodies = s.editBodies ?? []
  serve(s)
  const plain = fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url)
    if (path.startsWith('/__lab/frame-edit')) {
      s.calls.push('POST /__lab/frame-edit')
      const body = JSON.parse(String(init?.body)) as { stillId: string; prompt: string }
      s.editBodies.push(body)
      if (s.hangEdit) return new Promise<Response>(() => {})
      const id = `hero-edit${s.stills.length}`
      s.stills = [Object.assign(still(id), { editOf: body.stillId, prompt: body.prompt }), ...s.stills]
      return new Response(JSON.stringify({ still: s.stills[0] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return plain(url, init)
  }))
}

describe('"Edit this frame"', () => {
  it('shows the price beside the press and spends nothing before the press', async () => {
    const s = srv({ stills: [still('hero-1', { approved: true })] }); serveFrameEdit(s)
    render(<FrameEditHost />)
    const btn = await screen.findByTestId('frame-edit-press')
    expect(btn.textContent).toBe('Edit this frame')
    expect(btn.parentElement?.textContent).toMatch(new RegExp(`${FRAME_EDIT_CREDITS} cr`))
    expect(s.calls.filter((c) => c.startsWith('POST'))).toEqual([])
  })

  it('greys with its reason and spends nothing while there is no frame to edit yet', async () => {
    const s = srv(); serveFrameEdit(s)
    render(<FrameEditHost />)
    const btn = await screen.findByTestId('frame-edit-press') as HTMLButtonElement
    await waitFor(() => expect(btn.disabled).toBe(true))
    expect(btn.title).toMatch(/Draw the first frame first/)
    fireEvent.click(btn)
    await new Promise((r) => setTimeout(r, 20))
    expect(s.calls.filter((c) => c.startsWith('POST'))).toEqual([])
  })

  it('one typed change is one press: a new version lands, the old ones stay', async () => {
    const s = srv({ stills: [still('hero-1', { approved: true })] }); serveFrameEdit(s)
    render(<FrameEditHost />)
    fireEvent.change(await screen.findByTestId('frame-edit-text'), { target: { value: 'add fog' } })
    fireEvent.click(screen.getByTestId('frame-edit-press'))
    await screen.findByTestId('frame-version-hero-edit1')
    expect(s.calls.filter((c) => c === 'POST /__lab/frame-edit')).toEqual(['POST /__lab/frame-edit'])
    expect(s.editBodies).toEqual([{ takeId: 'take-1', stillId: 'hero-1', prompt: 'add fog' }]) // starts from the approved version
    expect(s.stills.map((x) => x.id).sort()).toEqual(['hero-1', 'hero-edit1'].sort()) // appended, nothing overwritten
    expect(screen.getByTestId('frame-version-hero-1')).toBeTruthy()
    expect(screen.getByTestId('frame-in-use-hero-1')).toBeTruthy() // the frame stays what it was until a version is picked
  })

  it('one edit at a time: while it runs the pill replaces the press and a second click sends nothing', async () => {
    const s = srv({ stills: [still('hero-1', { approved: true })] }, { hangEdit: true })
    serveFrameEdit(s)
    render(<FrameEditHost />)
    fireEvent.change(await screen.findByTestId('frame-edit-text'), { target: { value: 'remove the sign' } })
    fireEvent.click(screen.getByTestId('frame-edit-press'))
    await screen.findByTestId('frame-edit-phase')
    expect(screen.queryByTestId('frame-edit-press')).toBeNull()
    expect(s.calls.filter((c) => c === 'POST /__lab/frame-edit')).toHaveLength(1)
  })

  it('camera and zoom words warn, free and local, as the owner types; the sentence itself is not touched', async () => {
    const s = srv({ stills: [still('hero-1', { approved: true })] }); serveFrameEdit(s)
    render(<FrameEditHost />)
    const input = await screen.findByTestId('frame-edit-text')
    fireEvent.change(input, { target: { value: 'zoom out to show the whole pit lane' } })
    const warn = await screen.findByTestId('frame-edit-warning')
    expect(warn.textContent).toMatch(/camera/i)
    expect((input as HTMLInputElement).value).toBe('zoom out to show the whole pit lane')
  })

  it('a click on a version is the existing approve press: the used one wears the ✓', async () => {
    const s = srv({ stills: [still('hero-1', { approved: true }), still('hero-2')] }); serveFrameEdit(s)
    render(<FrameEditHost />)
    fireEvent.click(await screen.findByTestId('frame-show-hero-2'))
    await waitFor(() => expect(s.calls).toContain('POST /__lab/hero/approve'))
    await screen.findByTestId('frame-in-use-hero-2')
    expect(s.stills.find((x) => x.approved)?.id).toBe('hero-2') // the list the draw reads
    expect(screen.queryByTestId('frame-in-use-hero-1')).toBeNull()
  })

  it('the next edit starts from the clicked version', async () => {
    const s = srv({ stills: [still('hero-1', { approved: true }), still('hero-2')] }); serveFrameEdit(s)
    render(<FrameEditHost />)
    fireEvent.click(await screen.findByTestId('frame-show-hero-2'))
    fireEvent.change(screen.getByTestId('frame-edit-text'), { target: { value: 'make the suit white' } })
    fireEvent.click(screen.getByTestId('frame-edit-press'))
    await waitFor(() => expect(s.editBodies).toHaveLength(1))
    expect(s.editBodies[0]).toMatchObject({ stillId: 'hero-2' })
  })
})
