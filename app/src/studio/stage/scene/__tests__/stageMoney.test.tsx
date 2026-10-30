// @vitest-environment jsdom
// Money on the Stage before and after the set (the Brief and Board money guards, carried to the Setup panel and the Set panel's
// Build the set again), every paid call mocked: every paid press shows its price before anything is spent; typing, a remount and
// a second arrival spend nothing; a double click is one call; Build the set is the planner only (no master, nothing drawn); the
// running total counts only what landed (a refused plan adds nothing, the one that lands adds its price). Generate looks' price
// and double click are in personLook.test.tsx; Home's Start press sends nothing paid (home.test.tsx).
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SceneJobs } from '../../../../jobs/sceneJobs'
import type { ProjectionLabState } from '../../../../labs/projection/useProjectionLab'
import { plannerCredits, retryCost } from '../../../../shared/bibleContract'
import { DEVELOPED, PASTED } from '../../../scene/__tests__/developFixture'
import { fakeBrief, paidCalls, type FakeBrief } from '../../../scene/__tests__/briefFakes'
import { expectEveryPriceShown, price } from '../../../scene/__tests__/drive'
import { fakeApi, kitDeps, kitShot } from '../../../scene/__tests__/fakes'
import { PlannerError } from '../../../scene/briefApi'
import { castCard, freshGuided, propCard } from '../../../scene/design/guided'
import { freshDesign, markUnsynced, saveDesign, type Design } from '../../../scene/design/state'
import { SetupPanel } from '../../panels/SetupPanel'
import { StageSceneProvider, useStageScene, type StageScene } from '../StageScene'

const SCENE = 'sc-20261029020000-mony'
const lab = () => ({ kit: { id: null, world: null }, refreshShots: vi.fn(async () => [kitShot]), set: vi.fn() }) as unknown as ProjectionLabState

let brief: FakeBrief, bible: ReturnType<typeof fakeApi>, kit: ReturnType<typeof kitDeps>, jobs: SceneJobs
let seen: StageScene | null = null
function Peek() { seen = useStageScene(); return null }

beforeEach(() => {
  localStorage.clear(); seen = null
  brief = fakeBrief({ developed: DEVELOPED }); bible = fakeApi(); kit = kitDeps(); jobs = new SceneJobs(null)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 404 }))) // no project (no saved cast cards)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

const seed = (d: Design) => { saveDesign(d, SCENE); markUnsynced(SCENE) }
const ui = (children: React.ReactNode, worldId: string | null = null) => (
  <StageSceneProvider scene={SCENE} worldId={worldId} lab={lab()} deps={{ api: brief, bible: bible.api, jobs, buildKit: kit }}>
    <Peek />{children}
  </StageSceneProvider>
)
const press = async (id: string) => { await act(async () => { fireEvent.click(screen.getByTestId(id)) }) }
const twice = async (id: string) => { await act(async () => { const b = screen.getByTestId(id); fireEvent.click(b); fireEvent.click(b) }) }
const enabled = (id: string) => waitFor(() => expect((screen.getByTestId(id) as HTMLButtonElement).disabled).toBe(false))
const pause = () => act(async () => { await new Promise((k) => setTimeout(k, 50)) })

/** the design Develop leaves: the words, a Guided person and prop, no tile */
const developed = (): Design => ({ ...freshDesign(), brief: 'A small farmhouse kitchen at dawn. @mara lifts the copper kettle off the stove.',
  guided: { ...freshGuided([castCard('Mara', 'person', 'a cook in a faded blue apron')]), props: [propCard('Copper kettle', 'a dented copper kettle')] } })

describe('Stage: money', () => {
  it('every paid press is priced and nothing paid runs without its click; a double click is one call; a remount starts nothing', async () => {
    seed(developed())
    const r = render(ui(<SetupPanel />))
    await enabled('setup-build-press')
    // the one paid press carries its price before anything is spent; there is no Develop press
    expect(expectEveryPriceShown()).toBeGreaterThanOrEqual(1)
    expect(screen.queryByTestId('setup-develop-press')).toBeNull()
    expect(price('setup-build-press')).toBe(`≈ ${plannerCredits(1)} cr`)
    // typing the words spends nothing
    fireEvent.click(screen.getByTestId('setup-brief-view')) // words present: the editor opens on a click
    fireEvent.change(screen.getByTestId('setup-brief-input'), { target: { value: `${PASTED} At dawn.` } })
    await pause()
    expect(paidCalls(brief)).toBe(0)
    // Build the set: a double click is one plan; the set is approved for free; nothing else is drawn
    await enabled('setup-build-press')
    expectEveryPriceShown()
    await twice('setup-build-press')
    await waitFor(() => expect(bible.api.approveSet).toHaveBeenCalledTimes(1))
    expect(brief.plan).toHaveBeenCalledTimes(1)
    expect(brief.candidates).not.toHaveBeenCalled()
    expect(bible.api.drawMaster).not.toHaveBeenCalled()
    const n = paidCalls(brief)
    // a remount (a reload, a second arrival) brings the design back and starts nothing
    r.unmount()
    render(ui(<SetupPanel />))
    await enabled('setup-build-press')
    expectEveryPriceShown()
    await pause()
    expect(paidCalls(brief)).toBe(n)
  })

})

describe('Stage: the running total counts only what landed', () => {
  it('a refused plan adds nothing and says why; the one that lands adds its price', async () => {
    brief.plan.mockRejectedValueOnce(new Error('Day budget reached'))
    seed(developed())
    render(ui(<SetupPanel />))
    await enabled('setup-build-press')
    expect(seen!.x.s.d.spent).toBe(0)
    await press('setup-build-press')
    await waitFor(() => expect(screen.getByTestId('setup-build-error').textContent).toMatch(/Day budget reached/))
    expect(brief.plan).toHaveBeenCalledTimes(1)
    expect(bible.api.approveSet).not.toHaveBeenCalled()
    expect(seen!.x.s.d.spent).toBe(0)
    await enabled('setup-build-press')
    await press('setup-build-press')
    await waitFor(() => expect(bible.api.approveSet).toHaveBeenCalledTimes(1))
    expect(brief.plan).toHaveBeenCalledTimes(2)
    expect(seen!.x.s.d.spent).toBe(plannerCredits(1))
  })
})

// ported from plannerRetry (the Board's version): the planner's own paid retry and a double-failed answer are counted at what they billed
describe('Stage: the planner retry is counted in the spend', () => {
  it('retryCost: the measured retry, else the estimate again, else nothing', () => {
    expect(retryCost({ retried: true, retryCredits: 2.4 }, 2)).toBe(2.4)
    expect(retryCost({ retried: true, retryCredits: null }, 2)).toBe(2)
    expect(retryCost({ retried: false }, 2)).toBe(0)
    expect(retryCost(null, 2)).toBe(0)
  })

  it('a plan that needed its one retry adds the measured retry to the running total, once', async () => {
    const real = brief.plan.getMockImplementation()!
    brief.plan.mockImplementation(async (r) => ({ ...(await real(r)), retried: true, retryCredits: 2.5 }))
    seed(developed())
    render(ui(<SetupPanel />))
    await enabled('setup-build-press')
    await press('setup-build-press')
    await waitFor(() => expect(bible.api.approveSet).toHaveBeenCalledTimes(1))
    expect(brief.plan).toHaveBeenCalledTimes(1) // the retry is the server's, inside the one call: the app never sends a second plan
    expect(seen!.x.s.d.spent).toBe(plannerCredits(1) + 2.5)
  })

  it('a plan whose retry was not measured counts the planner price again', async () => {
    const real = brief.plan.getMockImplementation()!
    brief.plan.mockImplementation(async (r) => ({ ...(await real(r)), retried: true, retryCredits: null }))
    seed(developed())
    render(ui(<SetupPanel />))
    await enabled('setup-build-press')
    await press('setup-build-press')
    await waitFor(() => expect(bible.api.approveSet).toHaveBeenCalledTimes(1))
    expect(seen!.x.s.d.spent).toBe(2 * plannerCredits(1))
  })

  it('an answer that failed the check twice (a 422 that billed both tries) is counted at what it billed, and builds nothing', async () => {
    brief.plan.mockRejectedValue(new PlannerError('the planner answer did not pass the check twice', 422, true, undefined, undefined, 5.2))
    seed(developed())
    render(ui(<SetupPanel />))
    await enabled('setup-build-press')
    await press('setup-build-press')
    await waitFor(() => expect(seen!.x.s.d.spent).toBe(5.2))
    expect(kit.create).not.toHaveBeenCalled()
    expect(bible.api.approveSet).not.toHaveBeenCalled()
  })
})
