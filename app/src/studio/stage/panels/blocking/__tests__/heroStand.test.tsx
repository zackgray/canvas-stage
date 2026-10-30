// @vitest-environment jsdom
// Wave A (S3) + merge 6c (live-save, decision 4): the hero can stand at the mark (one point is a stand; Undo stops at the
// mark), drawing ends on Done, Esc or a click on the panel, a tag or a cast change dresses no one (one neutral figure), there is no Save button — every
// edit saves itself, debounced, through the performance route (a refusal keeps the draft and says why, un-retried), and the
// save lays the draft over the latest stored performance (a shot length saved elsewhere survives).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BibleRecord } from '../../../../../shared/bibleContract'
import type { KitItem, ScenePlan } from '../../../../../stage3d/contract'
import { standPath } from '../../../../../stage3d/motion/standPlan'
import type { KitWorld } from '../../../../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../../../../labs/projection/useProjectionLab'
import { viewBox } from '../blockingMath'
import { heroOps, type OpsCtx } from '../blockingOps'
import { BlockingPanel } from '../index'
import { SAVE_DEBOUNCE_MS } from '../useBlocking'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const ID = 'loc-2026-10-25T12-00-00-000'
const MARK = { at: [0.6, -12.5] as [number, number], yawDeg: 90 }
const plan = (kit: KitItem[] = []): ScenePlan => ({ seed: 1, flat: [-3, -16, 3, 8], sky: { url: '/lab-assets/sky/procedural' }, mark: MARK, kit: [...kit, { kind: 'tree', at: [-9, -14] }] })
const PATH: [number, number][] = [[0.6, -12.5], [0.6, -8]]
const worldOf = (perf: Partial<KitWorld['perf']> = {}, kit: KitItem[] = []): KitWorld =>
  ({ id: ID, description: 'd', plan: plan(kit), perf: { path: PATH, pace: 0.8, castId: 'brann', ...perf }, still: null, createdAt: '' })
const lab = (w: KitWorld) => ({ kit: { id: w.id, world: w, layer: null, perf: w.perf, error: null } }) as unknown as ProjectionLabState
const bible = {
  worldId: ID, version: 1, prompt: '', master: null, candidates: [], lighting: '', materials: '', grade: null, createdAt: '', updatedAt: '',
  elements: [{ tag: 'brann', kind: 'cast', cardId: 'brann', refs: [], line: '' }, { tag: 'sloane', kind: 'cast', cardId: 'sloane', refs: [], line: 'a woman in a long blue gown' }, { tag: 'guards', kind: 'extras', refs: [], line: 'two guards at the gate in plate armour' }],
  extrasSheet: { png: '/x.png', variants: 6 },
} satisfies BibleRecord

type Call = { url: string; raw?: string; body?: Record<string, unknown> }
function stubFetch(refuse?: string[]) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const raw = init?.body ? String(init.body) : undefined
    calls.push({ url, raw, body: raw ? JSON.parse(raw) : undefined })
    if (url.startsWith('/__lab/bible')) return new Response(JSON.stringify({ bible }), { status: 200 })
    if (refuse) return new Response(JSON.stringify({ error: 'the performance is not valid', errors: refuse }), { status: 422 })
    return new Response(JSON.stringify({ ...worldOf(), perf: raw ? JSON.parse(raw) : {} }), { status: 200 })
  }))
  return calls
}
const saveCall = (calls: Call[]) => calls.find((c) => c.url.startsWith('/__lab/stage3d/performance'))!
const perfCalls = (calls: Call[]) => calls.filter((c) => c.url.startsWith('/__lab/stage3d/performance'))
// live-save: edits save themselves, debounced — a test just waits for the performance POST and the saved word
const saved = async (calls: Call[]) => {
  await waitFor(() => expect(saveCall(calls)).toBeTruthy(), { timeout: 3000 })
  await waitFor(() => expect(screen.getByTestId('blocking-saved').textContent).toBe('Saved.'), { timeout: 3000 })
  return saveCall(calls)
}
const mount = async (w: KitWorld) => { const v = render(<BlockingPanel lab={lab(w)} />); await waitFor(() => expect(screen.getByTestId('blocking-cast')).toBeTruthy()); return v }
const mode = () => screen.getByTestId('blocking-mode-line').textContent ?? ''
const points = () => screen.getByTestId('blocking-path-line').textContent ?? ''
function clickGround(w: KitWorld, x: number, z: number) {
  const box = viewBox(w.plan, [PATH]), svg = screen.getByTestId('blocking-top-view')
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: (box[2] - box[0]) * 10, height: (box[3] - box[1]) * 10 } as DOMRect)
  fireEvent.click(svg, { clientX: (x - box[0]) * 10, clientY: (z - box[1]) * 10 })
}

describe('the hero stands at the mark', () => {
  it('Stands at the mark live-saves stand: true and a 0.2 m stub from the mark along its yaw', async () => {
    const calls = stubFetch()
    await mount(worldOf())
    fireEvent.change(screen.getByTestId('blocking-hero-mode'), { target: { value: 'stand' } })
    fireEvent.click(screen.getByTestId('blocking-stand-ask-yes'))
    expect(points()).toContain('Stands at the mark')
    const call = await saved(calls)
    expect(call.body!.stand).toBe(true)
    expect(call.body!.path).toEqual(standPath(MARK))
    const [[x0, z0], [x1, z1]] = call.body!.path as [number, number][]
    expect([x0, z0]).toEqual(MARK.at)
    expect(Math.hypot(x1 - x0, z1 - z0)).toBeCloseTo(0.2, 9)
    expect((Math.atan2(x1 - x0, z1 - z0) * 180) / Math.PI).toBeCloseTo(90, 6)
  })

  it('Undo stops at the mark; one point reads as standing and live-saves the stand', async () => {
    const calls = stubFetch()
    await mount(worldOf())
    expect(screen.queryByTestId('blocking-save')).toBeNull() // live-save: there is no Save button
    const undo = screen.getByTestId('blocking-path-undo') as HTMLButtonElement
    fireEvent.click(undo)
    expect(points()).toMatch(/^1 point · Stands at the mark/)
    expect(undo.disabled).toBe(true)
    fireEvent.click(undo)
    expect(points()).toMatch(/^1 point/)
    expect(screen.queryByTestId('blocking-save-reason')).toBeNull()
    expect(perfCalls(calls)).toHaveLength(0) // the debounce is still holding: no save has gone out yet
    const call = await saved(calls)
    expect(call.body).toMatchObject({ stand: true, path: standPath(MARK) })
  })

  it('Undo itself never removes point 1, even past a greyed button', () => {
    let path: [number, number][] = [[0, 0], [0, 3]]
    const ops = heroOps({ setPath: (f: (p: [number, number][]) => [number, number][]) => { path = f(path) } } as unknown as OpsCtx)
    ops.undo(); ops.undo()
    expect(path).toEqual([[0, 0]])
  })

  it('a saved stand reads back as one point, standing; Walks a path draws on from the mark and saves no stand', async () => {
    const calls = stubFetch()
    const w = worldOf({ stand: true, path: standPath(MARK) })
    await mount(w)
    expect(points()).toMatch(/^1 point · Stands at the mark/)
    expect((screen.getByTestId('blocking-hero-mode') as HTMLSelectElement).value).toBe('stand')
    fireEvent.change(screen.getByTestId('blocking-hero-mode'), { target: { value: 'walk' } })
    clickGround(w, 0.6, -6)
    const call = await saved(calls)
    expect(call.body!.stand).toBeUndefined()
    expect(call.body!.path).toEqual([MARK.at, [0.6, -6]])
  })

  it('a lift on the mark never moves it: it says how far the mark is from the set hive', async () => {
    stubFetch()
    const HIVE: KitItem = { kind: 'crates', args: [7, 1], at: [2.6, -12.5], label: 'a hive', pieceTag: 'prop:hive', scale: 1.4 }
    await mount(worldOf({ stand: true, path: standPath(MARK) }, [HIVE]))
    fireEvent.click(screen.getByTestId('blocking-action-add-lift'))
    expect(screen.getByTestId('blocking-path-0').getAttribute('cx')).toBe('0.6')
    expect(screen.getByTestId('blocking-path-0').getAttribute('cy')).toBe('-12.5')
    expect(screen.getByTestId('blocking-reach').textContent).toMatch(/^The mark is \d+\.\d m from the hive: move the mark beside it on the Set so the hero can reach it\.$/)
  })

  it('crossing presets are off while standing, and say why; Stage them still works', async () => {
    stubFetch()
    await mount(worldOf({ stand: true, path: standPath(MARK) }))
    const b = screen.getByTestId('blocking-extra-preset-front') as HTMLButtonElement
    expect([b.disabled, b.title]).toEqual([true, 'Needs a walking path'])
    expect(screen.getByTestId('blocking-presets-off').textContent).toContain('need a walking path')
    fireEvent.click(screen.getByTestId('blocking-stage-sloane'))
    expect(screen.getByTestId('blocking-extra-0')).toBeTruthy()
  })
})

describe('drawing always ends', () => {
  it('Esc during a hero draw, an extra draw and a face pick returns to select and adds no point', async () => {
    stubFetch()
    const w = worldOf({ extras: [{ path: [[4, -10]], gait: 'walk', delay: 0, costume: 'modern', variant: 0, stand: true }] })
    await mount(w)
    fireEvent.click(screen.getByTestId('blocking-path-draw'))
    expect(screen.getByTestId('blocking-path-draw').textContent).toBe('Done')
    expect(mode()).toMatch(/Esc or Done to finish\.$/)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(mode()).toMatch(/^Click a point on the hero path/)
    clickGround(w, 0.6, -6)
    expect(points()).toMatch(/^2 points/)

    fireEvent.click(screen.getByTestId('blocking-extra-0-draw'))
    expect(mode()).toMatch(/^Placing extra 1/)
    fireEvent.keyDown(screen.getByTestId('blocking-extra-0-draw'), { key: 'Escape' }) // focus inside the panel
    expect(mode()).toMatch(/^Click a point on the hero path/)

    fireEvent.click(screen.getByTestId('blocking-extra-0-face'))
    expect(mode()).toMatch(/faces\. Esc to cancel\.$/)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(mode()).toMatch(/^Click a point on the hero path/)
    clickGround(w, 0, -10)
    expect(screen.getByTestId('blocking-extra-0-face').textContent).toBe('Faces the hero: change') // no face was set
  })

  it('Done and a click on the panel away from the controls end a draw', async () => {
    stubFetch()
    await mount(worldOf())
    fireEvent.click(screen.getByTestId('blocking-path-draw'))
    fireEvent.click(screen.getByTestId('blocking-path-draw'))
    expect(mode()).toMatch(/^Click a point/)
    fireEvent.click(screen.getByTestId('blocking-path-draw'))
    fireEvent.click(screen.getByTestId('blocking-path-line'))
    expect(mode()).toMatch(/^Click a point/)
  })
})

describe('live-save: saved, refused, dressed, and the latest read', () => {
  it('a pace change saves itself: no Save press, no unsaved line, the saved word when it lands', async () => {
    const calls = stubFetch()
    await mount(worldOf())
    expect(screen.queryByTestId('blocking-save')).toBeNull()
    expect(screen.queryByTestId('blocking-unsaved')).toBeNull()
    fireEvent.change(screen.getByTestId('blocking-pace'), { target: { value: '1' } })
    expect(screen.queryByTestId('blocking-unsaved')).toBeNull()
    const call = await saved(calls)
    expect(call.body).toMatchObject({ pace: 1 })
  })

  it('a walking two-point save is byte-identical to the body before the wave', async () => {
    const calls = stubFetch()
    await mount(worldOf())
    fireEvent.change(screen.getByTestId('blocking-pace'), { target: { value: '1' } })
    const call = await saved(calls)
    expect(call.raw).toBe('{"path":[[0.6,-12.5],[0.6,-8]],"pace":1,"castId":"brann"}')
  })

  it('a refused save shows the server\'s plain sentence, keeps the draft and is not retried', async () => {
    const calls = stubFetch(['The shot length must be 2 to 8 seconds (a render keeps at most 8 s, 193 frames).'])
    await mount(worldOf())
    fireEvent.change(screen.getByTestId('blocking-pace'), { target: { value: '1' } })
    await waitFor(() => expect(screen.getByTestId('blocking-error').textContent).toContain('The shot length must be 2 to 8 seconds'))
    expect((screen.getByTestId('blocking-pace') as HTMLSelectElement).value).toBe('1') // the draft is kept
    await new Promise((r) => setTimeout(r, SAVE_DEBOUNCE_MS + 400))
    expect(perfCalls(calls)).toHaveLength(1) // the refused plan is not auto-retried
  })

  it('no Costume picker; a tag whose words name armour only tags the extra: its costume stays the constant', async () => {
    const calls = stubFetch()
    await mount(worldOf({ extras: [{ path: [[4, -10], [8, -10]], gait: 'walk', delay: 0, costume: 'modern', variant: 0 }] }))
    expect(screen.queryByText('Costume')).toBeNull()
    expect(screen.queryByLabelText(/costume/i)).toBeNull()
    fireEvent.change(screen.getByTestId('blocking-extra-0-tag'), { target: { value: 'guards' } })
    const call = await saved(calls)
    expect((call.body!.extras as { costume: string; tag: string }[])[0]).toMatchObject({ tag: 'guards', costume: 'modern' })
  })

  it('a cast change saves the new castId and no hero costume, whatever their words say', async () => {
    const calls = stubFetch()
    await mount(worldOf())
    fireEvent.change(screen.getByTestId('blocking-cast'), { target: { value: 'sloane' } })
    const call = await saved(calls)
    expect(call.body!.castId).toBe('sloane')
    expect(call.body).not.toHaveProperty('costume')
  })

  it('a shot length saved elsewhere while a draft is pending survives the live save', async () => {
    const calls = stubFetch()
    const w = worldOf()
    const v = await mount(w)
    fireEvent.change(screen.getByTestId('blocking-pace'), { target: { value: '1' } }) // a pending draft
    v.rerender(<BlockingPanel lab={lab({ ...w, perf: { ...w.perf, shotSeconds: 8 } })} />) // Operator saved a length
    const call = await saved(calls)
    expect(call.body).toMatchObject({ pace: 1, shotSeconds: 8 })
  })
})
