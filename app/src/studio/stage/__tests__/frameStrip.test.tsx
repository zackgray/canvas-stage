// @vitest-environment jsdom
// The version strip (owner 10-29): no buttons. One click on a version shows it, makes it the frame in use (the approve press) and the
// base of the next edit; the selected one wears a green ✓. A stale one, or any click while an edit runs, only shows. One muted line
// says so. A fake fetch plays the hero server; nothing billed.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HeroStill } from '../../../shared/shotContract'
import { resetSceneJobs } from '../../../jobs/sceneJobs'
import { resetL2RStore } from '../../render/l2rStore'
import { resetCurrentTake, setCurrentTake } from '../../shoot/currentTake'
import { resetClayStore } from '../../shoot/takeClay'
import { base, serve, still, type Server } from '../../shoot/__tests__/heroStillHarness'
import { FrameEditPanel } from '../FrameEditPanel'
import { FrameVersionsStrip, STRIP_NOTE } from '../FrameVersionsStrip'
import { useFrameEdit } from '../useFrameEdit'

beforeEach(() => { vi.useRealTimers(); resetCurrentTake(); resetClayStore(); setCurrentTake('take-1'); sessionStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetClayStore(); resetSceneJobs(); resetL2RStore(); localStorage.clear() })

function Host() {
  const model = useFrameEdit()
  return (<><FrameEditPanel model={model} /><FrameVersionsStrip model={model} /></>)
}

/** the hero server + an edit route that appends a version */
function serveAll(stills: HeroStill[]): Server {
  const s = base({ stills })
  serve(s)
  const plain = fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).startsWith('/__lab/frame-edit')) {
      s.calls.push('POST /__lab/frame-edit')
      const body = JSON.parse(String(init?.body)) as { stillId: string }
      s.stills = [still(`hero-e${s.stills.length}`, { editOf: body.stillId } as Partial<HeroStill>), ...s.stills]
      return new Response(JSON.stringify({ still: s.stills[0] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return plain(url, init)
  }))
  return s
}

const show = (id: string) => screen.getByTestId(`frame-show-${id}`) as HTMLButtonElement
const approves = (s: Server) => s.calls.filter((c) => c === 'POST /__lab/hero/approve')

describe('the frame version strip', () => {
  it('has no buttons but the thumbnails, and one short line', async () => {
    serveAll([still('hero-2'), still('hero-1', { approved: true })])
    render(<Host />)
    await screen.findByTestId('frame-in-use-hero-1')
    expect(screen.queryByText(/Use this frame|Edit from this|Next edit starts here/)).toBeNull()
    expect(screen.getByTestId('frame-versions').querySelectorAll('button')).toHaveLength(2)
    expect(screen.getByTestId('frame-versions-note').textContent).toBe(STRIP_NOTE)
  })

  it('first load: the approved version is selected (check and green outline)', async () => {
    serveAll([still('hero-2'), still('hero-1', { approved: true })])
    render(<Host />)
    expect((await screen.findByTestId('frame-in-use-hero-1')).textContent).toBe('✓')
    expect(screen.queryByTestId('frame-in-use-hero-2')).toBeNull()
    expect(show('hero-1').querySelector('img')?.style.outline).toMatch(/var\(--st-ok\)/)
  })

  it('none approved: the newest fresh version is the edit base and nothing wears a check until clicked', async () => {
    const s = serveAll([still('hero-2'), still('hero-1')])
    render(<Host />)
    await screen.findByTestId('frame-version-hero-2')
    expect(screen.queryByTestId(/^frame-in-use-/)).toBeNull()
    fireEvent.change(screen.getByTestId('frame-edit-text'), { target: { value: 'add fog' } })
    fireEvent.click(screen.getByTestId('frame-edit-press'))
    await waitFor(() => expect(s.calls).toContain('POST /__lab/frame-edit'))
    expect(approves(s)).toHaveLength(0)
  })

  it('a click approves that version and makes it the base of the next edit', async () => {
    const s = serveAll([still('hero-2'), still('hero-1', { approved: true })])
    render(<Host />)
    await screen.findByTestId('frame-in-use-hero-1')
    fireEvent.click(show('hero-2'))
    await screen.findByTestId('frame-in-use-hero-2')
    expect(screen.queryByTestId('frame-in-use-hero-1')).toBeNull()
    expect(approves(s)).toHaveLength(1)
    expect(s.stills.find((x) => x.approved)?.id).toBe('hero-2')
    fireEvent.click(show('hero-2')) // already in use: no second approval
    fireEvent.change(screen.getByTestId('frame-edit-text'), { target: { value: 'add fog' } })
    fireEvent.click(screen.getByTestId('frame-edit-press'))
    await waitFor(() => expect(s.calls).toContain('POST /__lab/frame-edit'))
    expect(approves(s)).toHaveLength(1)
    expect((screen.getByTestId('frame-edit-base') as HTMLImageElement).title).toBe('The edit starts from this version (hero-2)')
  })

  it('a stale version can be looked at, dimmed with its tag, and is never approved or used as a base', async () => {
    const s = serveAll([still('hero-2', { startKey: 'old00000' }), still('hero-1', { approved: true })])
    render(<Host />)
    expect((await screen.findByTestId('frame-stale-hero-2')).textContent).toBe('stale')
    expect(screen.getByTestId('frame-version-hero-2').style.opacity).toBe('0.55')
    expect(show('hero-2').title).toMatch(/Stale/)
    fireEvent.click(show('hero-2'))
    await new Promise((r) => setTimeout(r, 30))
    expect(approves(s)).toHaveLength(0)
    expect(screen.getByTestId('frame-in-use-hero-1')).toBeTruthy()
    expect((screen.getByTestId('frame-edit-base') as HTMLImageElement).title).toBe('The edit starts from this version (hero-1)')
  })

  // owner 10-29 (no Approve): a stale approval is not in use, so the one fresh version left is the frame by itself, once
  it('a stale approval is not in use: it never wears the check, and the lone fresh version is picked by itself', async () => {
    const s = serveAll([still('hero-2'), still('hero-1', { approved: true, startKey: 'old00000' })])
    render(<Host />)
    await screen.findByTestId('frame-stale-hero-1')
    await screen.findByTestId('frame-in-use-hero-2')
    expect(screen.queryByTestId('frame-in-use-hero-1')).toBeNull()
    expect(approves(s)).toHaveLength(1)
    expect(s.stills.find((x) => x.approved)?.id).toBe('hero-2')
  })

  it('while an edit runs a click only looks: nothing is approved', async () => {
    const s = serveAll([still('hero-2'), still('hero-1', { approved: true })])
    const plain = fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) =>
      String(url).startsWith('/__lab/frame-edit') ? new Promise<Response>(() => {}) : plain(url, init)))
    render(<Host />)
    fireEvent.change(await screen.findByTestId('frame-edit-text'), { target: { value: 'remove the helmet' } })
    fireEvent.click(screen.getByTestId('frame-edit-press'))
    await screen.findByTestId('frame-edit-phase')
    fireEvent.click(show('hero-2'))
    await new Promise((r) => setTimeout(r, 30))
    expect(approves(s)).toHaveLength(0)
    expect(screen.getByTestId('frame-in-use-hero-1')).toBeTruthy()
    expect(screen.queryByTestId('frame-in-use-hero-2')).toBeNull()
  })
})
