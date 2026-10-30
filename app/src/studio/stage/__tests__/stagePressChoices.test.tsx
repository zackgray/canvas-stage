// @vitest-environment jsdom
// The Stage's first-frame press choices (consistency pass, 2026-10-27): 1 or 2 stills beside "Draw the first frame" (the Brief's
// stepper, remembered for the scene, the price from the app's price basis); when another take of the scene has an approved first
// frame, the choice to use its look (stage-only: OFF on a fresh page; on, the press asks for its clothes and sends its seed); and a
// press of two stills offers both in the first-frame window's strip, one click using the one clicked (no Approve; owner 10-29). Faked routes: nothing is drawn or billed.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { kitStillCredits } from '../../../../server/hero/kitSpec'
import { OperatorEngine } from '../../../labs/controller/engine/engine'
import { STAGE_RIGS } from '../../../labs/projection/operator/link'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { resetSceneJobs } from '../../../jobs/sceneJobs'
import type { HeroStill } from '../../../shared/shotContract'
import type { StillPreviewRequest, StillPreviewResponse } from '../../../shared/stillPressContract'
import { resetL2RStore } from '../../render/l2rStore'
import { resetCurrentTake, setCurrentTake } from '../../shoot/currentTake'
import { resetFrameView, setFrameView } from '../../shoot/firstFrameView'
import { useHeroPublished } from '../../shoot/heroPublished'
import { useFrameEditHolder } from '../DrawBar'
import { HeroOverlay } from '../../shoot/HeroOverlay'
import { HeroStillBlock } from '../../shoot/HeroStillBlock'
import { take } from '../../shoot/__tests__/heroStillHarness'
import { resetStillRecipe } from '../../shoot/stillRecipe'
import { resetClayStore } from '../../shoot/takeClay'
import { DrawPress } from '../DrawPress'

const clay = { takeId: 'take-1', startKey: 'aaaa0001', mp4: '/c.mp4', frames: 121, width: 1920, height: 1088, status: 'done', finishedAt: 'f1', depth: { unitM: 0.001 } }
const LOOK = { seed: 1082798150, png: '/lab-assets/shots/take-0/hero/hero-a-1.png' }
const pair = (id: string): HeroStill => ({ id, takeId: 'take-1', startKey: 'aaaa0001', png: `/x/${id}.png`, seed: 5, jobId: 'j', credits: 21, approved: false, createdAt: '2026-10-27T10:00:00.000Z', role: 'opening', frame: 0 } as HeroStill)

function fakeLab(scene = 'kit-1') {
  return {
    op: { mode: 'orbit', setMode: vi.fn(), note: null, engine: new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false }) },
    stage: null, kit: { id: scene, perf: { castId: 'tina' } },
    s: { source: 'loc-1', look: 'textured' }, set: vi.fn(), shot: undefined, shots: [], pickSource: vi.fn(),
    performance: { listed: true, packs: [], selected: null, select: vi.fn(), phase: null, error: null, layer: null, plateAvailable: false, plateOn: true, setPlateOn: vi.fn() },
  } as unknown as ProjectionLabState
}

function serve(o: { look?: typeof LOOK | null; stills?: HeroStill[] } = {}) {
  const presses: Record<string, unknown>[] = [], approved: string[] = [], previews: StillPreviewRequest[] = []
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const p = String(url)
    if (p.startsWith('/__lab/takes')) return json({ takes: [take()] })
    if (p.startsWith('/__lab/clay')) return json({ clay })
    if (p.startsWith('/__lab/hero/preview')) {
      const q = JSON.parse(String(init?.body)) as StillPreviewRequest
      previews.push(q)
      const r: StillPreviewResponse = { role: 'opening', frame: 0, prompt: 'Photo of x.', composed: 'Photo of x.', edited: false, preset: 'photographic', count: q.count ?? 1,
        price: kitStillCredits(q.count ?? 1), refs: [], depthUrl: null, sameLook: q.sameLook ? o.look ?? null : null, lookFrame: o.look ?? null }
      return json(r)
    }
    if (p.startsWith('/__lab/hero/judge')) return json({ stillId: 'x', frame: 0, kit: true, width: 1920, height: 1088, layout: null, people: [], pieces: [], flagged: false, prices: { face: 3, prop: 3 }, redrawnInto: null })
    if (p.startsWith('/__lab/hero/approve')) { approved.push(JSON.parse(String(init?.body)).stillId); return json({ still: o.stills?.[0] }) }
    if (p === '/__lab/hero' && init?.method === 'POST') { presses.push(JSON.parse(String(init.body))); return json({ stills: [] }) }
    return json({ stills: o.stills ?? [], opening: { present: true, startKey: 'aaaa0001' }, running: null, unrecovered: [], unfinished: [] })
  }))
  return { presses, approved, previews }
}

const Stage = ({ scene }: { scene?: string }) => { const lab = fakeLab(scene); return <><HeroStillBlock lab={lab} kit capture={async () => new Blob(['x'])} pressInBar bare /><DrawPress verb="Draw the first frame" primary building={false} worldId={lab.kit?.id ?? null} /><HeroOverlay /></> }
/** the Stage with the draw bar's edit model held and the first-frame window opened on the take's frame (the thumbnail's click) */
function Holder() { useFrameEditHolder(); return null }
function Opener() { const id = useHeroPublished()?.overlay?.still.id ?? null; useEffect(() => { if (id) setFrameView(id, 'still') }, [id]); return null }
const Window = () => { const lab = fakeLab(); return <><HeroStillBlock lab={lab} kit capture={async () => new Blob(['x'])} pressInBar bare /><Holder /><Opener /><HeroOverlay /></> }
const priceShown = () => screen.getByTestId('hero-render').parentElement!.textContent

beforeEach(() => { resetCurrentTake(); resetClayStore(); resetFrameView(); setCurrentTake('take-1'); sessionStorage.clear(); localStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetClayStore(); resetSceneJobs(); resetL2RStore(); resetStillRecipe(); localStorage.clear() })

describe('1 or 2 stills beside the Stage press', () => {
  it('starts at 1; 2 doubles the price from the price basis and is sent; the scene remembers it, another scene starts at 1', async () => {
    const s = serve()
    const view = render(<Stage />)
    await waitFor(() => expect((screen.getByTestId('hero-render') as HTMLButtonElement).disabled).toBe(false))
    expect(screen.getByTestId('hero-count').textContent).toMatch(/Options each time.*1/)
    expect(priceShown()).toContain(`${kitStillCredits(1)} cr`)
    fireEvent.click(screen.getByTestId('hero-count-more'))
    await waitFor(() => expect(priceShown()).toContain(`${kitStillCredits(2)} cr`))
    expect((screen.getByTestId('hero-count-more') as HTMLButtonElement).disabled).toBe(true) // 2 at most
    fireEvent.click(screen.getByTestId('hero-render'))
    await waitFor(() => expect(s.presses).toHaveLength(1))
    expect(s.presses[0]).toMatchObject({ count: 2 })
    view.unmount()
    const again = render(<Stage />)
    await screen.findByTestId('hero-count')
    expect(screen.getByTestId('hero-count').textContent).toMatch(/2/)
    again.unmount()
    render(<Stage scene="kit-2" />)
    await screen.findByTestId('hero-count')
    expect(screen.getByTestId('hero-count').textContent).toMatch(/1/)
  })
})

// (owner 10-30) the same-look switch is hidden (LOOK_CONTROLS in DrawPress.tsx); unskip when it returns
describe.skip('same look as an earlier frame (opt-in)', () => {
  it('no approved frame elsewhere: no line, no seed and no look asked for', async () => {
    const s = serve()
    render(<Stage />)
    await waitFor(() => expect((screen.getByTestId('hero-render') as HTMLButtonElement).disabled).toBe(false))
    expect(screen.queryByTestId('hero-same-look')).toBeNull()
    fireEvent.click(screen.getByTestId('hero-render'))
    await waitFor(() => expect(s.presses).toHaveLength(1))
    expect(s.presses[0]).not.toHaveProperty('seed')
    expect(s.presses[0]).not.toHaveProperty('sameLook')
  })
  it('an approved frame on another take: off on a fresh page (card look, fresh seed); on, the press and its preview ask for its clothes and send its seed', async () => {
    const s = serve({ look: LOOK })
    render(<Stage />)
    expect((await screen.findByTestId('hero-same-look')).textContent).toMatch(/^Clothes from the person's card\. Use an earlier frame's look$/)
    await waitFor(() => expect((screen.getByTestId('hero-render') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('hero-render'))
    await waitFor(() => expect(s.presses).toHaveLength(1))
    expect(s.presses[0]).not.toHaveProperty('seed')
    expect(s.presses[0]).not.toHaveProperty('sameLook')
    expect(s.previews.every((q) => q.sameLook === undefined)).toBe(true)
    await waitFor(() => expect((screen.getByTestId('hero-render') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('hero-same-look-toggle'))
    expect(screen.getByTestId('hero-same-look').textContent).toMatch(/^Same look as an earlier frame: its clothes and seed\. Use the card's look$/)
    await waitFor(() => expect(s.previews.at(-1)).toMatchObject({ sameLook: true }))
    fireEvent.click(screen.getByTestId('hero-render'))
    await waitFor(() => expect(s.presses).toHaveLength(2))
    expect(s.presses[1]).toMatchObject({ seed: LOOK.seed, count: 1, sameLook: true })
    await waitFor(() => expect((screen.getByTestId('hero-render') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('hero-same-look-toggle'))
    fireEvent.click(screen.getByTestId('hero-render'))
    await waitFor(() => expect(s.presses).toHaveLength(3))
    expect(s.presses[2]).not.toHaveProperty('seed')
    expect(s.presses[2]).not.toHaveProperty('sameLook')
  })
})

describe('a press of two stills on the Stage', () => {
  // owner 10-29: no Approve press and no Still 1 / Still 2 pick; both versions sit in the first-frame window's strip, neither is
  // picked by itself, and one click on a version makes it the frame in use
  it("both are offered in the window's strip, neither is picked by itself, and one click uses the one clicked", async () => {
    const s = serve({ stills: [pair('hero-p-2'), pair('hero-p-1')] })
    render(<Window />)
    await screen.findByTestId('hero-overlay') // published, so open it as the take card's thumbnail does
    await screen.findByTestId('frame-show-hero-p-1')
    expect(screen.getByTestId('frame-show-hero-p-2')).toBeTruthy()
    expect(screen.queryByTestId('frame-pick')).toBeNull()
    expect(screen.queryAllByRole('button', { name: /approve/i })).toEqual([])
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(s.approved).toEqual([]) // two fresh versions: the owner picks
    fireEvent.click(screen.getByTestId('frame-show-hero-p-2'))
    await waitFor(() => expect(screen.getByTestId('hero-overlay-img').getAttribute('src')).toBe('/x/hero-p-2.png'))
    await waitFor(() => expect(s.approved).toEqual(['hero-p-2']))
    expect(s.presses).toEqual([])
  })
  it('one still: no picker, and it is the frame in use by itself, once', async () => {
    const s = serve({ stills: [pair('hero-p-1')] })
    render(<Window />)
    await screen.findByTestId('hero-overlay-img')
    expect(screen.queryByTestId('frame-pick')).toBeNull()
    await waitFor(() => expect(s.approved).toEqual(['hero-p-1']))
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(s.approved).toEqual(['hero-p-1'])
  })
})
