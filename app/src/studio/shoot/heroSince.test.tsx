// @vitest-environment jsdom
// Owner 2026-10-28: a first frame finished drawing, then the Board and back, and the Stage showed a still being drawn again until
// the job ended (nothing more was billed: a still is one job of two paid steps, the draw then the finish). The still block's clock
// restarted at the remount, so the still the draw had already listed read as older than the press, and the running pill came
// back. The clock is the job's own start now: back on the Stage mid-finish, the press says the still is in, not a new draw.
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetSceneJobs, sceneJobs } from '../../jobs/sceneJobs'
import { resetCurrentTake, setCurrentTake } from './currentTake'
import { HeroStillBlock, STILL_LANDED } from './HeroStillBlock'
import { useHeroPublished } from './heroPublished'
import { base, lab, serve, still } from './__tests__/heroStillHarness'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); resetCurrentTake(); resetSceneJobs(); localStorage.clear() })

function Press() {
  const p = useHeroPublished()?.press
  return <i data-testid="press">{p ? `${p.drawing ? 'drawing' : 'idle'}|${p.note ?? ''}` : 'none'}</i>
}

describe('the first frame after a tab switch', () => {
  it('back on the Stage while the finish still runs: the still is in (quiet line), never a new draw starting', async () => {
    const T0 = Date.parse('2026-10-22T13:00:00.000Z')
    const clock = vi.spyOn(Date, 'now').mockReturnValue(T0)
    void sceneJobs(null).run({ intent: 'hero', target: 'take-1', price: 21 }, () => new Promise(() => {})).catch(() => {}) // pressed at T0, still running
    clock.mockRestore() // the page's clock is now, long after the press
    serve(base({ stills: [still('hero-a1', { createdAt: new Date(T0 + 30_000).toISOString() })] })) // the draw's still, listed 30 s in
    setCurrentTake('take-1')
    render(<><HeroStillBlock lab={lab} pressInBar bare /><Press /></>)
    await waitFor(() => expect(screen.getByTestId('press').textContent).toBe(`idle|${STILL_LANDED}`))
  })
})
