// @vitest-environment jsdom
// The app's two faces by address: no scene named is Home (no viewport or stepper), a scene's stage shows that scene's stage
// under the stepper with Home one press away. The lab and screens are stubbed: this is the routing.
import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseStudioRoute } from '../../route'
import StudioApp from '../../StudioApp'

vi.mock('../Home', () => ({ Home: () => <p data-testid="studio-home">Home</p> }))
vi.mock('../../../labs/projection/useProjectionLab', () => ({ useProjectionLab: () => ({ op: { mode: 'free' } }) }))
vi.mock('../../../labs/projection/ui/LabViewport', () => ({ LabViewport: () => <canvas /> }))
vi.mock('../../../labs/projection/cut', () => ({ useCut: () => ({}) }))
vi.mock('../../../jobs/useSceneJobs', () => ({ useAttachJobs: () => undefined, useCurrentJobs: () => [] }))
vi.mock('../../../jobs/HangNotices', () => ({ HangNotices: () => null })) // the hung-job notice has its own tests; the routes don't need a job store
vi.mock('../../../library/useOpenScene', () => ({ useOpenScene: () => undefined }))
vi.mock('../../../library/currentScene', () => ({
  useCurrentScene: () => ({ id: 'sc-20261025120000-cccc', view: { name: 'Ski chase', worldId: null }, loading: false, error: null, stale: false }),
}))
vi.mock('../../project/shellProject', () => ({ useShellProject: () => ({ name: null }) }))
vi.mock('../../scene/castCards', () => ({ useCastCards: () => ({ cards: [] }) }))
vi.mock('../../useLabDefaults', () => ({ useLabDefaults: () => undefined }))
vi.mock('../../stage/DrawBar', () => ({ DrawBar: () => <div data-testid="draw-bar" /> })) // the transport row: the draw bar's own suites test it
vi.mock('../../StageScreen', () => ({ StageScreen: ({ stage }: { stage: string }) => <p data-testid={`screen-${stage}`}>{stage}</p> }))
// the Stage's scene design (its design calls and job consumer) has its own suites; here only where it is live
vi.mock('../../stage/scene/StageScene', () => ({
  StageSceneProvider: ({ live, children }: { live?: boolean; children?: ReactNode }) => <div data-testid="stage-scene" data-live={String(live ?? true)}>{children}</div>,
  useStageScene: () => null,
}))

afterEach(cleanup)
const SC = 'sc-20261025120000-cccc'
const at = (path: string) => render(<StudioApp route={parseStudioRoute(path)!} />)

describe('the app by address', () => {
  it('#/studio shows Home alone: no viewport or stepper', () => {
    at('studio')
    expect(screen.getByTestId('studio-home')).toBeTruthy()
    for (const id of ['studio-root', 'studio-viewport', 'stepper']) expect(screen.queryByTestId(id)).toBeNull()
  })

  it('#/studio/<scene>/stage opens that scene\'s Stage under the stepper, with Home one press away', () => {
    at(`studio/${SC}/stage`)
    expect(screen.getByTestId('screen-stage')).toBeTruthy()
    expect(screen.queryByTestId('studio-home')).toBeNull()
    expect(screen.getByTestId('studio-project').textContent).toBe('Ski chase')
    expect(screen.getByTestId('stepper').querySelector('[aria-current="step"]')!.textContent).toBe('Stage')
    expect(screen.getByTestId('home-link').getAttribute('href')).toBe('#/studio')
    expect(screen.getByTestId('step-render').getAttribute('href')).toBe(`#/studio/${SC}/render`)
    // the lab viewport fills the Stage: shown here, hidden on Render and Export
    expect(screen.getByTestId('studio-viewport').getAttribute('aria-hidden')).toBe('false')
    // the Stage's one copy of the scene design is live around it
    expect(screen.getByTestId('stage-scene').getAttribute('data-live')).toBe('true')
    expect(screen.getByTestId('stage-scene').contains(screen.getByTestId('screen-stage'))).toBe(true)
  })

  it('every old hash (a bare scene, /scene, /brief, /board, /set, /shoot) opens the Stage under the same tab bar', () => {
    for (const tail of ['', '/scene', '/brief', '/board', '/set', '/shoot']) {
      at(`studio/${SC}${tail}`)
      expect(screen.getByTestId('screen-stage'), tail).toBeTruthy()
      expect(screen.queryByTestId('studio-home')).toBeNull()
      cleanup()
    }
  })

  it('Render and Export wear the same four-item tab bar, the scene design live on each', () => {
    for (const stage of ['render', 'export']) {
      at(`studio/${SC}/${stage}`)
      expect([...screen.getByTestId('stepper').querySelectorAll('a')].map((a) => a.textContent)).toEqual(['‹ Home', 'Stage', 'Render', 'Export'])
      expect(screen.getByTestId('stage-scene').getAttribute('data-live')).toBe('true')
      cleanup()
    }
  })
})
