// @vitest-environment jsdom
// The Stage's "how to draw the first frame" row (draw-from-master, T4): shown only when the scene has a look frame; the two-way
// switch (short labels, the long text in the tooltips) defaults to "From words" on every scene, also one with a look frame (review
// F2, the orchestrator's decision; APPROVED_FRAME_DEFAULT in useDrawMode.ts) and the owner's own choice wins, per scene; "From approved frame" sends mode 'edit' and shows the preview's price; "Use this frame as
// the scene's look" posts the take and the still; the row reads by decision — the switch first, then the Draw press under it;
// no model or graph names in the owner's words.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { kitStillCredits } from '../../../../server/hero/kitSpec'
import { OperatorEngine } from '../../../labs/controller/engine/engine'
import { STAGE_RIGS } from '../../../labs/projection/operator/link'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { resetSceneJobs } from '../../../jobs/sceneJobs'
import type { HeroStill } from '../../../shared/shotContract'
import type { EditPreview, StillPreviewRequest, StillPreviewResponse } from '../../../shared/stillPressContract'
import { resetL2RStore } from '../../render/l2rStore'
import { resetCurrentTake, setCurrentTake } from '../../shoot/currentTake'
import { resetFrameView } from '../../shoot/firstFrameView'
import { HeroOverlay } from '../../shoot/HeroOverlay'
import { HeroStillBlock } from '../../shoot/HeroStillBlock'
import { take } from '../../shoot/__tests__/heroStillHarness'
import { readSceneDrawMode } from '../../shoot/useDrawMode'
import { resetStillRecipe } from '../../shoot/stillRecipe'
import { resetClayStore } from '../../shoot/takeClay'
import { DrawPress } from '../DrawPress'

const clay = { takeId: 'take-1', startKey: 'aaaa0001', mp4: '/c.mp4', frames: 121, width: 1920, height: 1088, status: 'done', finishedAt: 'f1', depth: { unitM: 0.001 } }
const EDIT_PRICE = 28
const editOf = (o: Partial<EditPreview> = {}): EditPreview => ({ available: true, why: null, lookUrl: '/lab-assets/shots/take-0/hero/hero-a-1.png', hasPlate: false, plateUrl: null, price: EDIT_PRICE, plateCredits: 17, seedCredits: 11, ...o })
const NONE = editOf({ available: false, why: 'No approved frame yet.', lookUrl: null })
const approvedStill = (): HeroStill => ({ id: 'hero-p-1', takeId: 'take-1', startKey: 'aaaa0001', png: '/x/hero-p-1.png', seed: 5, jobId: 'j', credits: 21, approved: true, createdAt: '2026-10-27T10:00:00.000Z', role: 'opening', frame: 0 } as HeroStill)

function fakeLab(scene = 'kit-1') {
  return {
    op: { mode: 'orbit', setMode: vi.fn(), note: null, engine: new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false }) },
    stage: null, kit: { id: scene, perf: { castId: 'tina' } },
    s: { source: 'loc-1', look: 'textured' }, set: vi.fn(), shot: undefined, shots: [], pickSource: vi.fn(),
    performance: { listed: true, packs: [], selected: null, select: vi.fn(), phase: null, error: null, layer: null, plateAvailable: false, plateOn: true, setPlateOn: vi.fn() },
  } as unknown as ProjectionLabState
}

function serve(o: { edit?: EditPreview; stills?: HeroStill[]; look?: { seed: number; png: string } } = {}) {
  const presses: Record<string, unknown>[] = [], previews: StillPreviewRequest[] = [], looks: Record<string, unknown>[] = []
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const p = String(url)
    if (p.startsWith('/__lab/takes')) return json({ takes: [take()] })
    if (p.startsWith('/__lab/clay')) return json({ clay })
    if (p.startsWith('/__lab/hero/look')) { looks.push(JSON.parse(String(init?.body))); return json({ look: {} }) }
    if (p.startsWith('/__lab/hero/preview')) {
      const q = JSON.parse(String(init?.body)) as StillPreviewRequest
      previews.push(q)
      const edit = o.edit ?? NONE
      const r: StillPreviewResponse = { role: 'opening', frame: 0, prompt: 'Photo of x.', composed: 'Photo of x.', edited: false, preset: 'photographic', count: q.count ?? 1,
        price: q.mode === 'edit' ? edit.price : kitStillCredits(q.count ?? 1), mode: q.mode ?? 'depth', edit, refs: [], depthUrl: null, sameLook: null, ...(o.look ? { lookFrame: o.look } : {}) }
      return json(r)
    }
    if (p.startsWith('/__lab/hero/judge')) return json({ stillId: 'x', frame: 0, kit: true, width: 1920, height: 1088, layout: null, people: [], pieces: [], flagged: false, prices: { face: 3, prop: 3 }, redrawnInto: null })
    if (p === '/__lab/hero' && init?.method === 'POST') { presses.push(JSON.parse(String(init.body))); return json({ stills: [] }) }
    return json({ stills: o.stills ?? [], opening: { present: true, startKey: 'aaaa0001' }, running: null, unrecovered: [], unfinished: [] })
  }))
  return { presses, previews, looks }
}

const Stage = ({ scene }: { scene?: string }) => { const lab = fakeLab(scene); return <><HeroStillBlock lab={lab} kit capture={async () => new Blob(['x'])} pressInBar bare /><DrawPress verb="Draw the first frame" primary building={false} worldId={lab.kit?.id ?? null} /><HeroOverlay /></> }
const priceShown = () => screen.getByTestId('hero-render').parentElement!.textContent
const ready = () => waitFor(() => expect((screen.getByTestId('hero-render') as HTMLButtonElement).disabled).toBe(false))

beforeEach(() => { resetCurrentTake(); resetClayStore(); resetFrameView(); setCurrentTake('take-1'); sessionStorage.clear(); localStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetClayStore(); resetSceneJobs(); resetL2RStore(); resetStillRecipe(); localStorage.clear() })

// (owner 10-30) the draw-mode row is hidden (LOOK_CONTROLS in DrawPress.tsx); unskip when it returns
describe.skip('the draw-mode row', () => {
  it('shows only when the scene has a look frame', async () => {
    serve()
    render(<Stage />)
    await ready()
    expect(screen.queryByTestId('draw-mode')).toBeNull()
  })

  it('with a look frame: opens in From words (review F2: never the approved frame unless chosen), shows the thumbnail and a plain cue, says no model words', async () => {
    const s = serve({ edit: editOf(), look: { seed: 7, png: '/lab-assets/shots/take-0/hero/hero-a-1.png' } })
    render(<Stage />)
    const row = await screen.findByTestId('draw-mode')
    expect(screen.getByTestId('draw-mode-look').getAttribute('src')).toBe('/lab-assets/shots/take-0/hero/hero-a-1.png')
    // the opt-in "Use an earlier frame's look" is there in From words, and off
    expect((await screen.findByTestId('hero-same-look')).textContent).toMatch(/^Clothes from the person's card\. Use an earlier frame's look$/)
    expect(row.textContent).toContain('From words')
    expect(row.textContent).toContain('From approved frame')
    expect(row.textContent).not.toMatch(/qwen|edit\b|klein|plate|latent|controlnet|seed/i)
    expect(row.innerHTML).not.toMatch(/qwen|klein|plate|latent|controlnet|seed/i)
    await ready()
    expect(screen.getByTestId('draw-mode-switch-depth').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('draw-mode-cue').textContent).toBe('Draws from your words and the 3D set; nothing is taken from the approved frame unless you choose it.')
    expect(priceShown()).toContain(`${kitStillCredits(1)} cr`)
    fireEvent.click(screen.getByTestId('hero-render'))
    await waitFor(() => expect(s.presses).toHaveLength(1))
    expect(s.presses[0]).not.toHaveProperty('mode')
    expect(s.presses[0]).not.toHaveProperty('sameLook')
    expect(s.previews.every((q) => q.mode !== 'edit')).toBe(true)
    expect(readSceneDrawMode('kit-1', 'x' as never)).toBe('x') // nothing stored: the default was not written as a choice
  })

  it('choosing From approved frame sticks, and the cue says it takes the clothes and the place and can copy other things too', async () => {
    serve({ edit: editOf() })
    const view = render(<Stage />)
    await screen.findByTestId('draw-mode')
    fireEvent.click(screen.getByTestId('draw-mode-switch-edit'))
    await waitFor(() => expect(screen.getByTestId('draw-mode-cue').textContent).toBe('Takes the clothes and the place from the approved frame, and can copy other things from it too; about 11 cr a redraw after the first. Two options are drawn each time.'))
    view.unmount()
    render(<Stage />)
    await screen.findByTestId('draw-mode')
    expect(screen.getByTestId('draw-mode-switch-edit').getAttribute('aria-pressed')).toBe('true')
  })

  it('an explicit choice of words and the set for the scene wins over the look-frame default, and the switch goes back', async () => {
    localStorage.setItem('canvas-stage.draw-mode.kit-1', 'depth')
    const s = serve({ edit: editOf() })
    render(<Stage />)
    await screen.findByTestId('draw-mode')
    await ready()
    expect(screen.getByTestId('draw-mode-switch-depth').getAttribute('aria-pressed')).toBe('true')
    expect(priceShown()).toContain(`${kitStillCredits(1)} cr`)
    fireEvent.click(screen.getByTestId('draw-mode-switch-edit')) // the switch stays: back to the approved frame
    await waitFor(() => expect(priceShown()).toContain(`${EDIT_PRICE} cr`))
    expect(readSceneDrawMode('kit-1')).toBe('edit')
    expect(s.presses).toHaveLength(0)
  })

  it('the nudge shows only without an approved frame, in plain words', async () => {
    serve()
    const view = render(<Stage />)
    const nudge = await screen.findByTestId('draw-nudge')
    expect(nudge.textContent).toBe('Draw one frame of the whole scene and pick it first. Your other angles will match it.')
    expect(nudge.textContent).not.toMatch(/qwen|edit|klein|plate|latent|controlnet|seed/i)
    expect(screen.queryByTestId('draw-mode')).toBeNull()
    view.unmount(); cleanup()
    serve({ edit: editOf() })
    render(<Stage />)
    await screen.findByTestId('draw-mode')
    expect(screen.queryByTestId('draw-nudge')).toBeNull()
  })

  it('"From your approved frame" shows the preview price and sends mode edit with no seed; the choice is remembered for the scene only', async () => {
    const s = serve({ edit: editOf() })
    const view = render(<Stage />)
    await screen.findByTestId('draw-mode')
    fireEvent.click(screen.getByTestId('draw-mode-switch-edit'))
    await waitFor(() => expect(priceShown()).toContain(`${EDIT_PRICE} cr`))
    expect(s.previews.some((q) => q.mode === 'edit')).toBe(true)
    expect(readSceneDrawMode('kit-1')).toBe('edit')
    await ready()
    fireEvent.click(screen.getByTestId('hero-render'))
    await waitFor(() => expect(s.presses).toHaveLength(1))
    expect(s.presses[0]).toMatchObject({ mode: 'edit' })
    expect(s.presses[0]).not.toHaveProperty('seed')
    view.unmount()
    render(<Stage />)
    await waitFor(() => expect(priceShown()).toContain(`${EDIT_PRICE} cr`))
    expect(screen.getByTestId('draw-mode-switch-edit').getAttribute('aria-pressed')).toBe('true')
    cleanup()
    render(<Stage scene="kit-2" />)
    await screen.findByTestId('draw-mode')
    expect(readSceneDrawMode('kit-2')).toBe('depth') // this scene was never chosen for: it follows the default, not kit-1's choice
  })

  it('the stale-pointer note shows when the preview carries one', async () => {
    serve({ edit: editOf({ stale: 'The frame you picked as the scene\'s look is gone or no longer approved, so the first approved frame is used.' }) })
    render(<Stage />)
    expect((await screen.findByTestId('draw-mode-stale')).textContent).toMatch(/no longer approved/)
  })

  it('"Use this frame as the scene\'s look" posts the take and the still of the approved first frame', async () => {
    const s = serve({ edit: editOf(), stills: [approvedStill()] })
    render(<Stage />)
    fireEvent.click(await screen.findByTestId('draw-mode-use-look'))
    await waitFor(() => expect(s.looks).toEqual([{ takeId: 'take-1', stillId: 'hero-p-1' }]))
    expect((await screen.findByTestId('draw-mode-said')).textContent).toMatch(/now the scene's look/)
  })

  it('"Draw again with this seed" is priced as the edit it sends (edit and finish, plus the plate while there is none), never as a depth draw', async () => {
    const Block = () => { const lab = fakeLab(); return <><HeroStillBlock lab={lab} kit capture={async () => new Blob(['x'])} pressInBar /><DrawPress verb="Draw the first frame" primary building={false} worldId={lab.kit?.id ?? null} /></> }
    const s = serve({ edit: editOf({ price: 39 }), stills: [approvedStill()] })
    const view = render(<Block />)
    await screen.findByTestId('draw-mode')
    fireEvent.click(screen.getByTestId('draw-mode-switch-edit'))
    await waitFor(() => expect(screen.getByTestId('hero-redraw-hero-p-1').parentElement!.textContent).toContain('28 cr'))
    fireEvent.click(screen.getByTestId('hero-redraw-hero-p-1'))
    await waitFor(() => expect(s.presses).toHaveLength(1))
    expect(s.presses[0]).toMatchObject({ mode: 'edit', count: 1 })
    view.unmount(); cleanup()
    serve({ edit: editOf({ hasPlate: true, price: 11 }), stills: [approvedStill()] })
    render(<Block />)
    await waitFor(() => expect(screen.getByTestId('hero-redraw-hero-p-1').parentElement!.textContent).toContain('11 cr'))
  })
})
