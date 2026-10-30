// @vitest-environment jsdom
// Export today (review item 13, F6): the take picked on Render, named, with its own Download; the scene's other rendered takes
// listed with their own Download and a Show here that picks them; a picked take with no render says so. Faked routes; free.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { L2RRender, TakeRecord } from '../../shared/shotContract'
import type { ShotRow } from '../../shared/shotsListContract'
import { resetSceneJobs } from '../../jobs/sceneJobs'
import { pick, resetL2RStore } from '../render/l2rStore'
import { resetCurrentTake } from '../shoot/currentTake'
import { OtherShots } from './OtherShots'
import { TakeShot, useTakeShot } from './TakeShot'

const rec = (id: string, lockedAt: string): TakeRecord => ({ id, worldId: 'loc-a', packId: null, fps: 24, frames: 49, samples: [], focal: 35, viewAspect: 1.77,
  perfStart: 0, startKey: 'k', lockedAt, createdAt: lockedAt })
const A = rec('take-2026-10-28T05-00-00-001', '2026-10-28T05:00:00.001Z')
const B = rec('take-2026-10-27T05-00-00-001', '2026-10-27T05:00:00.001Z')
const C = rec('take-2026-10-26T05-00-00-001', '2026-10-26T05:00:00.001Z')
const row = (t: TakeRecord, o: Partial<ShotRow>): ShotRow => ({ takeId: t.id, lockedAt: t.lockedAt, frames: t.frames, state: 'none', video: null, renderId: null, finished: false, credits: null, thumb: null, ...o })
const shots = [row(A, {}), row(B, { state: 'finished', video: '/b-fin.mp4', finished: true, thumb: '/b.png' }), row(C, { state: 'raw', video: '/c-raw.mp4' })]
const done = (t: TakeRecord, url: string): L2RRender => ({ id: 'l2r-1', takeId: t.id, stillId: 's', clay: '/c.mp4', raw: url, finished: url, jobId: 'j', credits: 20, status: 'done', createdAt: 'x' })
const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  localStorage.clear(); resetL2RStore(); resetCurrentTake()
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/__lab/takes') return ok({ takes: [A, B, C] })
    if (url.startsWith('/__lab/l2r/shots?world=loc-a')) return ok({ shots })
    if (url.startsWith('/__lab/l2r?take=')) return ok({ renders: url.includes(B.id) ? [done(B, '/b-fin.mp4')] : [], take: [A, B, C].find((t) => url.includes(t.id)), missing: [] })
    return ok({})
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); resetL2RStore(); resetCurrentTake(); resetSceneJobs() })

function Export() { const shot = useTakeShot('loc-a'); return <><TakeShot shot={shot} />{shot.state && <OtherShots s={shot.state} />}</> }

describe('Export: the picked take and the other shots', () => {
  it('a picked take with no render says so by name; the other rendered takes each have their own Download', async () => {
    render(<Export />)
    await waitFor(() => expect(screen.getByTestId('export-take-none').textContent).toMatch(/^Take · 28 Oct 05:00 · 2\.0 s has no rendered shot yet/))
    await waitFor(() => expect(screen.getByTestId(`export-other-download-${B.id}`).getAttribute('href')).toBe('/b-fin.mp4'))
    expect(screen.getByTestId(`export-other-download-${C.id}`).getAttribute('href')).toBe('/c-raw.mp4')
    expect(screen.queryByTestId(`export-other-${A.id}`)).toBeNull() // the picked take is not an "other", and has nothing to download
    expect(screen.getByTestId(`export-other-${C.id}`).textContent).toMatch(/raw, not finished/)
  })

  it('Show here picks the take: it becomes this take\'s shot and leaves the others list', async () => {
    render(<Export />)
    fireEvent.click(await screen.findByTestId(`export-other-show-${B.id}`))
    await waitFor(() => expect(screen.getByTestId('export-take-download').getAttribute('href')).toBe('/b-fin.mp4'))
    expect(screen.getByTestId('export-take-name').textContent).toMatch(/^Take · 27 Oct 05:00/)
    await waitFor(() => expect(screen.queryByTestId(`export-other-${B.id}`)).toBeNull())
    await act(async () => { pick(A.id) }) // and back: the same one pick Render makes
    await waitFor(() => expect(screen.getByTestId(`export-other-${B.id}`)).toBeTruthy())
  })
})
