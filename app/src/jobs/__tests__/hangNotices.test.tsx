// @vitest-environment jsdom
// The "Not responding - Check / Release" notice, on a fake clock: absent while a job is within its limit, shown once it passes, and its
// two buttons reach the server (fake) and re-read the records. Nothing is sent to Cloud.
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SceneJobRecord } from '../../shared/libraryContract'
import type { LibraryApi } from '../../library/api'
import { HangNotices } from '../HangNotices'
import { hangLimitMs } from '../hangLimits'
import type { HangApi } from '../hangApi'
import { JOB_RELEASED, SceneJobs } from '../sceneJobs'

const SCENE = 'sc-20261025090000-aaaa'
const T0 = Date.parse('2026-10-25T10:00:00Z')
let clock = T0
const rec = (o: Partial<SceneJobRecord> = {}): SceneJobRecord => ({
  id: 'j-aaaaaa-000001', scene: SCENE, intent: 'l2r', target: 'take-1', price: 20, route: '/__lab/l2r', status: 'running',
  startedAt: new Date(T0).toISOString(), ...o,
})

function setup(server: { jobs: SceneJobRecord[] }) {
  const api = { jobs: vi.fn(async () => server.jobs), clearJob: vi.fn(async () => true) } as unknown as LibraryApi
  const store = new SceneJobs(SCENE, { api, storage: null, now: () => clock })
  const hang: HangApi = {
    check: vi.fn(async () => ({ cloud: 'in_progress', released: false, message: 'Cloud says it is still in_progress.' })),
    release: vi.fn(async () => { server.jobs = [rec({ status: 'lost', released: new Date(clock).toISOString() })]; return { released: true, message: 'Released: other jobs can go now.' } }),
  }
  return { store, hang }
}
const tickBy = async (ms: number) => { clock += ms; await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }

beforeEach(() => { clock = T0; vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('HangNotices', () => {
  it('shows nothing within the limit, then "not responding" once the clock passes it', async () => {
    const { store, hang } = setup({ jobs: [rec()] })
    await act(async () => { await store.sync() })
    render(<HangNotices store={store} api={hang} tickMs={1000} />)
    expect(screen.queryByTestId('hang-notices')).toBeNull()
    await tickBy(hangLimitMs('l2r'))
    expect(screen.queryByTestId('hang-notices')).toBeNull() // exactly at the limit: not yet
    await tickBy(2000)
    expect(screen.getByTestId('hang-j-aaaaaa-000001').textContent).toMatch(/not responding/i)
    expect(screen.getByTestId('hang-j-aaaaaa-000001').textContent).toMatch(/may still finish and bill/)
  })

  it('never shows for a job queued behind another, whatever the clock says', async () => {
    const { store, hang } = setup({ jobs: [rec({ waiting: true })] })
    await act(async () => { await store.sync() })
    render(<HangNotices store={store} api={hang} tickMs={1000} />)
    await tickBy(10 * hangLimitMs('l2r'))
    expect(screen.queryByTestId('hang-notices')).toBeNull()
  })

  it('Check asks the server and says what Cloud answered', async () => {
    const { store, hang } = setup({ jobs: [rec()] })
    await act(async () => { await store.sync() })
    render(<HangNotices store={store} api={hang} tickMs={1000} />)
    await tickBy(hangLimitMs('l2r') + 2000)
    await act(async () => { screen.getByTestId('hang-check').click() })
    expect(hang.check).toHaveBeenCalledWith(SCENE, 'j-aaaaaa-000001')
    expect(hang.release).not.toHaveBeenCalled()
    expect(screen.getByTestId('hang-line').textContent).toMatch(/still in_progress/)
  })

  it('Release goes to the server, then the notice goes away because the record no longer runs', async () => {
    const { store, hang } = setup({ jobs: [rec()] })
    await act(async () => { await store.sync() })
    render(<HangNotices store={store} api={hang} tickMs={1000} />)
    await tickBy(hangLimitMs('l2r') + 2000)
    await act(async () => { screen.getByTestId('hang-release').click() })
    expect(hang.release).toHaveBeenCalledWith(SCENE, 'j-aaaaaa-000001')
    expect(store.snapshot().jobs[0].status).toBe('lost') // re-read from the server
    expect(screen.queryByTestId('hang-notices')).toBeNull()
  })

  it('a released job tells its owner it may still bill (not "the server restarted")', () => {
    expect(JOB_RELEASED).toMatch(/may still finish and bill/)
    expect(JOB_RELEASED).toMatch(/Nothing was sent again/)
  })

  it('a refused Release (too young) shows the server\'s reason', async () => {
    const { store, hang } = setup({ jobs: [rec()] })
    hang.release = vi.fn(async () => { throw new Error('It has not run longer than a l2r job takes') })
    await act(async () => { await store.sync() })
    render(<HangNotices store={store} api={hang} tickMs={1000} />)
    await tickBy(hangLimitMs('l2r') + 2000)
    await act(async () => { screen.getByTestId('hang-release').click() })
    expect(screen.getByTestId('hang-line').textContent).toMatch(/not run longer/)
    expect(screen.getByTestId('hang-notices')).toBeTruthy()
  })
})
