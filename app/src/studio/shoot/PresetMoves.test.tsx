// @vitest-environment jsdom
// The Camera panel's preset moves through the real panel: pick a move and a length, Record it, and the engine films a normal take
// of that length; Record's label carries the render price from the same price function; R works after pressing a button (focus).
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Quaternion, Vector3 } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { l2rEstimate } from '../../../server/l2r/price'
import { STAGE_RIGS } from '../../labs/projection/operator/link'
import { StageOperatorEngine } from '../../labs/projection/operator/stageEngine'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { CameraPanel as ShootScreen } from '../stage/panels/CameraPanel'
import { resetStageMemo } from '../stage/stageMemory'
import { PresetMoves } from './PresetMoves'
import type { BibleRecord } from '../../shared/bibleContract'
import { entityName, tagSaid } from './castNames'

vi.mock('../stage/panels/blocking', () => ({ BlockingPanel: () => <section data-testid="blocking-stub" /> }))

function fakeLab() {
  const engine = new StageOperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false, orbitTarget: () => new Vector3(0, 1.6, 0) })
  engine.takeOver(new Vector3(0, 1.6, 6), new Quaternion(), 35)
  const lab = {
    op: { mode: 'operator', setMode: vi.fn(), note: null, engine }, stage: null,
    s: { source: 'synthetic' }, shot: undefined, shots: [], pickSource: vi.fn(),
    performance: { listed: true, packs: [], selected: null, select: vi.fn(), phase: null, error: null, layer: null, plateAvailable: false, plateOn: true, setPlateOn: vi.fn() },
  } as unknown as ProjectionLabState
  return { lab, engine }
}
const done = [{ frames: 193, credits: 62 }]

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/__lab/l2r/price'
    ? new Response(JSON.stringify({ done }), { headers: { 'content-type': 'application/json' } })
    : new Response('{}', { status: 404 }))))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); resetStageMemo() })

describe('Shoot: preset camera moves', () => {
  it('Record this move films a take of the chosen length (4 s = 97 frames) that the lock block can lock', async () => {
    const { lab, engine } = fakeLab()
    render(<ShootScreen lab={lab} />)
    fireEvent.click(screen.getByTestId('preset-orbit-right'))
    fireEvent.click(screen.getByTestId('shot-length-4')) // the Shot length row is the preset's Length
    screen.getByTestId('preset-record').focus() // a real click leaves the focus on the button
    fireEvent.click(screen.getByTestId('preset-record'))
    expect(engine.move?.id).toBe('orbit-right')
    expect(document.activeElement).toBe(document.body) // focus left the button: R is the camera's again
    act(() => { for (let i = 0; i < 400 && engine.move; i++) engine.tick(1 / 60, 16 / 9) })
    expect(engine.deck.take?.raw.samples).toHaveLength(97)
  })

  it('no Preview (it is Play now); Record says the length and Free (the render price is on Render alone), and no price paragraph', async () => {
    const { lab, engine } = fakeLab()
    render(<ShootScreen lab={lab} />)
    expect(screen.queryByTestId('preset-preview')).toBeNull()
    const at = (s: number) => l2rEstimate(Math.floor(s * 24) + 1, done).credits
    await waitFor(() => expect(screen.getByTestId('preset-record').textContent).toBe('Record · 2 s'))
    expect(screen.getByTestId('preset-record').parentElement?.textContent).toBe('Record · 2 sFree')
    expect(at(2)).toBeGreaterThan(0)
    expect(screen.queryByTestId('preset-price')).toBeNull()
    expect(engine.deck.takeCount).toBe(0)
  })

  it('R starts and stops a hand-flown take in the Camera pane; Fly it yourself is one row there (no rig choice)', () => {
    const { lab, engine } = fakeLab()
    const detach = engine.attach(document.createElement('div'))
    render(<ShootScreen lab={lab} />)
    expect(screen.getByTestId('preset-fly').textContent).toBe('Fly it yourself') // item 13: back as one row
    expect(screen.queryByTestId('record')).toBeNull()
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true })); engine.tick(1 / 60, 16 / 9) })
    expect(engine.deck.recording).toBe(true)
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000) // R is Record's press too: it counts after the guard's pause
    act(() => { engine.tick(1 / 60, 16 / 9); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true })); engine.tick(1 / 60, 16 / 9) })
    expect(engine.deck.recording).toBe(false)
    clock.mockRestore()
    detach()
  })
})

describe('PresetMoves: Hold on the subject', () => {
  const withSubject = (chest: [number, number, number]) => {
    const { engine } = fakeLab()
    ;(engine as unknown as { world: unknown }).world = { performance: { chestAt: () => new Vector3(...chest) }, clock: engine.timeline, sources: () => [], trackHash: '' }
    return engine
  }
  const ui = (engine: StageOperatorEngine, hero: string | null = null) => render(<PresetMoves engine={engine} press={(a) => a()} hero={hero} secs={2} />)

  it('no performer, no checkbox; with one it is named from the hero tag, else "the subject"; ticking it centres her at once, on any move', () => {
    ui(fakeLab().engine)
    expect(screen.queryByTestId('preset-hold-subject')).toBeNull()
    cleanup()
    const engine = withSubject([0, 1.2, 0])
    const aim = vi.spyOn(engine, 'aimAtSubject')
    ui(engine)
    expect(screen.getByTestId('presets').textContent).toContain('Moves stay on the subject')
    expect((screen.getByTestId('preset-hold-subject') as HTMLInputElement).disabled).toBe(false) // Push in, the default move, too
    fireEvent.click(screen.getByTestId('preset-hold-subject'))
    expect(aim).toHaveBeenCalledTimes(1)
    cleanup()
    ui(withSubject([0, 1.2, 0]), 'the beekeeper')
    expect(screen.getByTestId('presets').textContent).toContain('Moves stay on the beekeeper')
    expect(screen.getByTestId('presets').textContent).not.toContain('@')
  })

  it('the hold shows only for preset moves, never while flying, and the aim picker the other way round', () => {
    const engine = withSubject([0, 1.2, 0])
    const view = render(<PresetMoves engine={engine} press={(a) => a()} secs={2} onFly={() => {}} aim={<p data-testid="aim-lock" />} />)
    expect(screen.getByTestId('preset-hold-subject')).toBeTruthy()
    expect(screen.queryByTestId('aim-lock')).toBeNull()
    view.rerender(<PresetMoves engine={engine} press={(a) => a()} secs={2} fly onFly={() => {}} aim={<p data-testid="aim-lock" />} />)
    expect(screen.queryByTestId('preset-hold-subject')).toBeNull()
    expect(screen.getByTestId('aim-lock')).toBeTruthy()
  })

  it('Shoot names the hold from the world\'s scene sheet by the hero\'s plain name, never "@tag"', async () => {
    const { lab } = fakeLab()
    const engine = withSubject([0, 1.2, 0])
    ;(lab.op as { engine: unknown }).engine = engine
    ;(lab as { kit: unknown }).kit = { id: 'loc-x', perf: { castId: 'card-k' } }
    const sheet = { elements: [{ tag: 'keeper', kind: 'cast', cardId: 'card-k', refs: [], line: '' }], brief: { elements: [{ tag: 'keeper', name: 'The beekeeper', type: 'person' }] } }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (String(url).includes('world=loc-x')
      ? new Response(JSON.stringify({ bible: sheet }), { headers: { 'content-type': 'application/json' } }) : new Response('{}', { status: 404 }))))
    render(<ShootScreen lab={lab} />)
    await waitFor(() => expect(screen.getByTestId('presets').textContent).toContain('Moves stay on the beekeeper'))
    expect(screen.getByTestId('presets').textContent).not.toContain('@keeper')
  })

  it('the hold is named by the plain name, never the @tag: the brief name with its article, else the tag as words', () => {
    const brief = { elements: [{ tag: 'maria', name: 'Maria', type: 'person' }, { tag: 'keeper', name: 'The beekeeper', type: 'person' }] }
    const bible = { elements: [], brief } as unknown as BibleRecord
    expect(tagSaid(bible, 'maria')).toBe('Maria')
    expect(tagSaid(bible, 'keeper')).toBe('the beekeeper')
    expect(tagSaid(null, 'old_mill')).toBe('the old mill')
    expect(entityName({ ...bible, elements: [{ tag: 'maria', kind: 'cast', cardId: 'c', refs: [], line: '' }] } as BibleRecord, 'c', 'hero')).toBe('Maria')
  })

  it('a ticked hold reaches the engine for every move: a pull out and a crane alike (owner 2026-10-28)', () => {
    const engine = withSubject([0, 1.2, 0])
    const start = vi.spyOn(engine, 'startPreset')
    ui(engine)
    fireEvent.click(screen.getByTestId('preset-pull'))
    fireEvent.click(screen.getByTestId('preset-hold-subject'))
    fireEvent.click(screen.getByTestId('preset-record'))
    expect(start).toHaveBeenLastCalledWith('pull', 2, true, true)
    act(() => engine.stopPreset())
    fireEvent.click(screen.getByTestId('preset-crane'))
    fireEvent.click(screen.getByTestId('preset-record'))
    expect(start).toHaveBeenLastCalledWith('crane', 2, true, true)
  })
})
