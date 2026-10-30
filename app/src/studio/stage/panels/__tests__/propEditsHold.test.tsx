// @vitest-environment jsdom
// Add a prop: an ADVANCED edit holds (prop-edits-hold, owner 2026-10-29: a side view typed in View came back as the front view and
// the draw went out with the front-view words). The cause was the review reopened from a drawn candidate's card: it brought back the
// label and Describe it but not the parts, so the next Draw went with the defaults. Now each drawn candidate keeps the parts it was
// drawn with; the edit holds through the tab switches, typing in Describe it (even words that flip the stated view), the draw, the
// review reopened from the list, Draw another, and the placed prop's own card.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScenePlan } from '../../../../stage3d/contract'
import { DEFAULT_SKY } from '../../../../stage3d/planRules'
import type { KitWorld } from '../../../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../../../labs/projection/useProjectionLab'
import type { BibleApi } from '../../../scene/bibleApi'
import type { BriefApi } from '../../../scene/briefApi'
import type { Piece } from '../../../scene/design/model'
import type { PiecesApi } from '../../../scene/piecesApi'
import { resetAutoBuilds } from '../../../scene/pieceAutoBuild'
import { conceptPrompt } from '../../../../../server/scene/conceptText.ts'
import { AddDialog } from '../../AddDialog'
import { propParts } from '../propPrefs'
import type { StagePropDesign } from '../../stageProp'

beforeEach(() => { resetAutoBuilds(); vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 404 }))) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); resetAutoBuilds() })

const plan: ScenePlan = { seed: 1, sentence: 'a yard', sky: { url: DEFAULT_SKY, look: 'dusk' }, kit: [] }
const world = { id: 'loc-h', description: 'd', plan, perf: { path: [], castId: null }, still: null, masterDepth: null, createdAt: 't' } as unknown as KitWorld
const lab = { kit: { id: 'loc-h', world, layer: null, perf: world.perf, error: null }, stage: null } as unknown as ProjectionLabState
const AT: [number, number] = [1, -4]
const CAR = 'An open-wheel single-seater race car with wide slick tyres, a tall rear wing and an open cockpit with a protective bar.'
const SIDE = 'seen from the side, in side profile'

function mount() {
  const answers = [['/d/1.png'], ['/d/2.png'], ['/d/3.png']]
  const brief = {
    loadDraft: vi.fn(), saveDraft: vi.fn(), saveCard: vi.fn(), uploadReference: vi.fn(),
    candidates: vi.fn(async (..._a: unknown[]) => ({ urls: answers.shift() ?? [] })),
  } as unknown as BriefApi & { candidates: ReturnType<typeof vi.fn> }
  const pieces = { get: vi.fn(async () => ({ price: 8, tiles: [], running: null, setChangedAt: null, stillStale: false })), build: vi.fn(() => new Promise(() => {})) } as unknown as PiecesApi
  const bible = { get: vi.fn(async () => ({ bible: null, running: null })), putElement: vi.fn(async () => ({ bible: null, running: null })) } as unknown as BibleApi
  const tiles: Piece[] = []
  const design: StagePropDesign = { pieces: () => tiles, add: (t) => { tiles.push(t) }, drop: vi.fn(), saved: vi.fn(async () => {}) }
  const add = vi.fn(async (..._a: unknown[]) => true)
  const place = { item: null, swap: vi.fn(), add, error: null } as never
  render(<AddDialog lab={lab} place={place} at={AT} kind="prop" onClose={vi.fn()} deps={{ bible, pieces, brief, design }} />)
  return { brief, add }
}
const view = () => (screen.getByTestId('add-gen-part-view') as HTMLTextAreaElement).value
const sentParts = (brief: { candidates: ReturnType<typeof vi.fn> }, call: number) => (brief.candidates.mock.calls[call][0] as { parts?: unknown }).parts

describe('an ADVANCED edit holds (prop-edits-hold)', () => {
  it('through the tab switches and typing in Describe it, even words that flip the stated view; the draw sends it as the line shows', async () => {
    const { brief } = mount()
    fireEvent.click(await screen.findByTestId('add-card-+new'))
    fireEvent.change(screen.getByTestId('add-gen-name'), { target: { value: 'car' } })
    fireEvent.change(screen.getByTestId('add-gen-desc'), { target: { value: CAR } })
    fireEvent.click(screen.getByTestId('add-gen-tab-advanced'))
    fireEvent.change(screen.getByTestId('add-gen-part-view'), { target: { value: SIDE } })
    const line = screen.getByTestId('add-gen-part-sent').textContent
    expect(line).toContain(SIDE)
    fireEvent.click(screen.getByTestId('add-gen-tab-describe'))
    expect(screen.getByTestId('add-gen-edited-note')).toBeTruthy()
    expect(screen.getByTestId('add-gen-sent').textContent).toBe(line)
    // Describe it now states a view, then no longer does: the edited View is never dropped or overwritten
    fireEvent.change(screen.getByTestId('add-gen-desc'), { target: { value: `${CAR} In side view.` } })
    fireEvent.change(screen.getByTestId('add-gen-desc'), { target: { value: CAR } })
    fireEvent.click(screen.getByTestId('add-gen-tab-advanced'))
    expect(view()).toBe(SIDE)
    expect(screen.getByTestId('add-gen-part-view-edited')).toBeTruthy()
    fireEvent.click(screen.getByTestId('add-gen-draw'))
    await waitFor(() => expect(brief.candidates).toHaveBeenCalledTimes(1))
    expect(sentParts(brief, 0)).toEqual({ view: SIDE })
    expect(conceptPrompt('prop', { description: CAR, parts: { view: SIDE } })).toBe(line!.replace(/^What will be sent: /, ''))
    await screen.findByTestId('add-gen-use')
    expect(view()).toBe(SIDE) // the candidates arriving change nothing
  })

  it('the review reopened from the drawn card keeps the parts; Draw another and the placed prop use them', async () => {
    const { brief } = mount()
    fireEvent.click(await screen.findByTestId('add-card-+new'))
    fireEvent.change(screen.getByTestId('add-gen-name'), { target: { value: 'car' } })
    fireEvent.change(screen.getByTestId('add-gen-desc'), { target: { value: CAR } })
    fireEvent.click(screen.getByTestId('add-gen-tab-advanced'))
    fireEvent.change(screen.getByTestId('add-gen-part-view'), { target: { value: SIDE } })
    fireEvent.click(screen.getByTestId('add-gen-draw'))
    await screen.findByTestId('add-gen-use')
    fireEvent.click(screen.getByTestId('add-gen-cancel')) // back to the cards, then the drawn card again
    fireEvent.click(await screen.findByTestId('add-card-gen:0'))
    expect(screen.getByTestId('add-gen-tab-advanced').textContent).toBe('ADVANCED · edited')
    expect(screen.getByTestId('add-gen-edited-note')).toBeTruthy()
    expect(screen.getByTestId('add-gen-sent').textContent).toContain(SIDE)
    expect(screen.getByTestId('add-gen-sent').textContent).not.toContain('seen flat on from the front')
    fireEvent.click(screen.getByTestId('add-gen-again'))
    await waitFor(() => expect(brief.candidates).toHaveBeenCalledTimes(2))
    expect(sentParts(brief, 1)).toEqual({ view: SIDE })
    fireEvent.click(screen.getAllByTestId('add-gen-use')[0])
    await waitFor(() => expect(propParts('loc-h', 'car')).toEqual({ view: SIDE })) // the prop card's more pictures draw with them too
  })

  it('a candidate drawn before parts were kept (none stored) reopens on the defaults', async () => {
    localStorage.setItem('canvas-stage.stage-fresh.loc-h', JSON.stringify({ 'gen:prop': [{ url: '/d/a.png', name: 'Cart · look 1', desc: 'a green hand cart' }] }))
    mount()
    fireEvent.click(await screen.findByTestId('add-card-gen:0'))
    expect(screen.getByTestId('add-gen-tab-advanced').textContent).toBe('ADVANCED')
    expect(screen.queryByTestId('add-gen-edited-note')).toBeNull()
  })
})
