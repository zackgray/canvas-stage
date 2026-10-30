// @vitest-environment jsdom
// L2RBlock against fixture answers of GET /__lab/takes (T1) and GET /__lab/l2r?take= (T3): the take's inputs or what is
// missing, whether it is ready (status only: the paid press is the screen's primary button), the store's one POST, progress,
// the Finished / Raw player and Recover by id.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { L2RListResponse, L2RRender, TakeRecord } from '../../shared/shotContract'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { resetSceneJobs } from '../../jobs/sceneJobs'
import { L2RBlock, RenderAgain, RenderRunPill } from './L2RBlock'
import { useL2R } from './l2rModel'
import type { L2RStatusExtra } from './l2rExtra'
import { render as renderL2R, resetL2RStore, setSeed } from './l2rStore'

const TAKE = 'take-2026-10-22T19-00-00-000'
const take: TakeRecord = { id: TAKE, worldId: 'loc-1', packId: null, fps: 24, frames: 97, samples: [], focal: 35, viewAspect: 1.77, perfStart: 0, startKey: 'k', lockedAt: '2026-10-22T19:00:00.000Z', createdAt: '2026-10-22T19:00:00.000Z' }
const clay = { takeId: TAKE, startKey: 'k', mp4: `/lab-assets/shots/${TAKE}/clay/clay.mp4`, frames: 97, width: 1920 as const, height: 1088 as const, status: 'done' as const }
const still = { id: 'still-1', takeId: TAKE, startKey: 'k', png: `/lab-assets/shots/${TAKE}/hero/still-1.png`, seed: 1, jobId: null, credits: 1, approved: true, createdAt: 't' }
const done: L2RRender = { id: 'l2r-1', takeId: TAKE, stillId: 'still-1', clay: clay.mp4, raw: '/raw.mp4', finished: '/fin.mp4', jobId: 'job-12345678', credits: 21, status: 'done', createdAt: 't' }
const ready = (o: Partial<L2RListResponse & L2RStatusExtra> = {}): L2RListResponse & L2RStatusExtra => ({ renders: [], take, clay, still, missing: [], prompt: 'A man. Real live-action footage.', configured: true,
  estimate: { credits: 21, perFrame: 0.21, frames: 97, basis: 'about 0.21 cr per frame' }, running: null, finishing: [], ...o })

let l2r: L2RListResponse & L2RStatusExtra
let posts: { url: string; body: Record<string, unknown> }[]
const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
const lab = {} as ProjectionLabState
/** the block plus Render's press-bar secondary button (the screen mounts it beside the primary) */
function WithAgain() { const l = useL2R(); return <><L2RBlock lab={lab} /><RenderAgain l={l} /></> }

/** the block plus the pill that takes the primary button's place while a render runs (the screen swaps them) */
function WithPill() { const l = useL2R(); return <><L2RBlock lab={lab} /><RenderRunPill l={l} /><RenderAgain l={l} /></> }

beforeEach(() => {
  resetL2RStore(); posts = []; l2r = ready()
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/__lab/takes') return ok({ takes: [take] })
    if (init?.method === 'POST') { posts.push({ url, body: JSON.parse(String(init.body)) }); return ok({ render: done }) }
    if (url.startsWith('/__lab/l2r?take=')) return ok(l2r)
    return ok({ error: 'no' }, 404)
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetL2RStore(); resetSceneJobs() }) // a job left running by one test is not the next one's

describe('L2RBlock', () => {
  it('shows the approved still and the clay, says it is ready with no paid button of its own, and the store POSTs once', async () => {
    render(<L2RBlock lab={lab} />)
    await screen.findByTestId('l2r-still')
    expect(screen.getByTestId('l2r-clay').getAttribute('src')).toBe(clay.mp4)
    expect(screen.queryByTestId('l2r-render')).toBeNull()
    expect(screen.getByTestId('l2r-status').textContent).toBe('Ready: press Render clip in the first frame\'s window on the Stage (≈ 21 cr).')
    l2r = ready({ renders: [done] })
    await act(async () => { await renderL2R() })
    expect(posts).toEqual([{ url: '/__lab/l2r', body: { takeId: TAKE, stillId: 'still-1', seed: 42, hold: 'wide' } }])
    await screen.findByTestId('l2r-player')
    expect(screen.getByTestId('l2r-player-video').getAttribute('src')).toBe('/fin.mp4')
    fireEvent.click(screen.getByTestId('l2r-player-cut-raw'))
    expect(screen.getByTestId('l2r-player-video').getAttribute('src')).toBe('/raw.mp4')
  })

  it('after a done render, "Render again" is the one paid button, beside Export; a new seed moves it to the primary (B2)', async () => {
    l2r = ready({ renders: [done] })
    render(<WithAgain />)
    const again = await screen.findByTestId('l2r-render-again')
    expect(screen.getByTestId('l2r-status').textContent).toMatch(/Rendered/)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    await act(async () => { fireEvent.click(again) })
    // a render again draws from a fresh seed by default (review F7: no seed field), never the first render's 42 again
    expect(posts).toEqual([{ url: '/__lab/l2r', body: { takeId: TAKE, stillId: 'still-1', seed: 2 ** 30, hold: 'wide' } }])
    vi.restoreAllMocks()
    act(() => setSeed(7))
    expect(screen.queryByTestId('l2r-render-again')).toBeNull() // the primary is "Render again" now: never two paid buttons
    expect(screen.getByTestId('l2r-status').textContent).toBe('Ready: press Render again in the first frame\'s window on the Stage (≈ 21 cr).')
    await act(async () => { await renderL2R() })
    expect(posts.at(-1)).toEqual({ url: '/__lab/l2r', body: { takeId: TAKE, stillId: 'still-1', seed: 7, hold: 'wide' } })
    expect(await screen.findByTestId('l2r-render-again')).toBeTruthy() // rendered with these settings: back beside Export
  })

  it('lists every take of the set newest first, each with its length, its newest render state, what it billed and its picture; a pick is the one take, remembered (review F5, F16)', async () => {
    const older = { ...take, id: 'take-2026-10-24T05-49-49-800', frames: 193, lockedAt: '2026-10-24T05:49:49.800Z' }
    const newer = { ...take, id: 'take-2026-10-24T14-48-09-431', frames: 49, lockedAt: '2026-10-24T14:48:09.431Z' }
    const shots = [
      { takeId: newer.id, lockedAt: newer.lockedAt, frames: 49, state: 'none', video: null, renderId: null, finished: false, credits: null, thumb: null },
      { takeId: older.id, lockedAt: older.lockedAt, frames: 193, state: 'finished', video: '/fin-old.mp4', renderId: 'l2r-9', finished: true, credits: 26, thumb: '/old.png' },
    ]
    const asked: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      asked.push(url)
      if (url === '/__lab/takes') return ok({ takes: [older, newer] })
      if (url.startsWith('/__lab/l2r/shots?world=')) return ok({ shots })
      if (url.startsWith('/__lab/l2r?take=')) return ok(ready({ take: url.includes(older.id) ? older : newer }))
      return ok({ error: 'no' }, 404)
    }))
    function Scoped() { useL2R('loc-1'); return <L2RBlock lab={lab} /> }
    render(<Scoped />)
    await waitFor(() => expect(screen.getByTestId(`l2r-shot-line-${older.id}`).textContent).toBe('8.0 s · finished · 26 cr billed'))
    expect(screen.queryByTestId('l2r-take')).toBeNull() // no dropdown any more
    const rows = [...screen.getByTestId('l2r-shots').querySelectorAll('li')].map((li) => li.getAttribute('data-testid'))
    expect(rows).toEqual([`l2r-shot-${newer.id}`, `l2r-shot-${older.id}`])
    expect(screen.getByTestId(`l2r-shot-line-${newer.id}`).textContent).toBe('2.0 s · not rendered')
    expect(screen.getByTestId(`l2r-shot-pick-${newer.id}`).getAttribute('aria-pressed')).toBe('true') // opens on the just-locked take
    expect(screen.getByTestId(`l2r-shot-${older.id}`).querySelector('img')!.getAttribute('src')).toBe('/old.png')
    expect(screen.queryByTestId(`l2r-shot-play-${newer.id}`)).toBeNull() // nothing to play yet
    fireEvent.click(screen.getByTestId(`l2r-shot-play-${older.id}`)) // Play picks the take and its render plays in the viewer
    await waitFor(() => expect(screen.getByTestId(`l2r-shot-pick-${older.id}`).getAttribute('aria-pressed')).toBe('true'))
    await waitFor(() => expect(asked.some((u) => u === `/__lab/l2r?take=${encodeURIComponent(older.id)}`)).toBe(true))
    expect(localStorage.getItem('canvas-stage.render-take.loc-1')).toBe(older.id)
  })

  it('a render interrupted before it reached Cloud says nothing was billed and offers Render, not Recover (B5)', async () => {
    l2r = ready({ renders: [{ ...done, status: 'failed', raw: null, finished: null, jobId: null, credits: 0, interrupted: true, error: 'Interrupted before it was sent to Cloud: nothing was billed. Render again.' }] })
    render(<L2RBlock lab={lab} />)
    expect((await screen.findByTestId('l2r-interrupted')).textContent).toMatch(/nothing was billed/)
    expect(screen.queryByTestId('l2r-recover')).toBeNull()
    expect(screen.getByTestId('l2r-status').textContent).toBe('Ready: press Render clip in the first frame\'s window on the Stage (≈ 21 cr).')
  })

  it('says what is missing and where to get it, and Render is off', async () => {
    l2r = ready({ still: null, clay: null, missing: [
      { code: 'no_clay', message: "This take's frames are not prepared yet.", where: 'In Shoot, lock the take and press Prepare the frames (free).' },
      { code: 'no_still', message: 'This take has no approved hero still.', where: 'Approve a hero still in Shoot.' }] })
    render(<L2RBlock lab={lab} />)
    expect((await screen.findByTestId('l2r-missing-no_clay')).textContent).toMatch(/Prepare the frames/)
    expect(screen.getByTestId('l2r-missing-no_still').textContent).toMatch(/Approve a hero still in Shoot/)
    expect(screen.getByTestId('l2r-status').textContent).toMatch(/Needs the prepared frames and an approved opening still/)
  })

  it('a stale still is shown as missing, not as the look', async () => {
    l2r = ready({ missing: [{ code: 'stale_still', message: 'The approved still shows an older opening of this take.', where: 'Render and approve a new hero still in Shoot.' }] })
    render(<L2RBlock lab={lab} />)
    await screen.findByTestId('l2r-missing-stale_still')
    expect(screen.queryByTestId('l2r-still')).toBeNull()
    expect(screen.getByTestId('l2r-status').textContent).toMatch(/Needs the prepared frames and an approved opening still/)
  })

  it('while a render runs: progress, and Render is off', async () => {
    l2r = ready({ running: { since: new Date().toISOString(), what: `l2r ${TAKE} l2r-2` }, renders: [{ ...done, id: 'l2r-2', status: 'running', raw: null, finished: null }] })
    render(<WithPill />)
    await screen.findByRole('progressbar', { name: /rendering on Comfy Cloud/ })
    expect(screen.getByTestId('l2r-status').textContent).toBe('A render is running.')
  })

  it('the run pill shows the clock, the estimate from the take length (97 f = about 2 minutes) and the price; never before a press', async () => {
    render(<WithPill />)
    await screen.findByTestId('l2r-still')
    expect(screen.queryByTestId('render-pill')).toBeNull() // nothing pressed, nothing running
    cleanup(); resetL2RStore()
    l2r = ready({ running: { since: new Date(Date.now() - 65_000).toISOString(), what: `l2r ${TAKE} l2r-2` }, renders: [{ ...done, id: 'l2r-2', status: 'running', raw: null, finished: null }] })
    render(<WithPill />)
    const pill = await screen.findByTestId('render-pill')
    expect(screen.getByTestId('render-pill-estimate').textContent).toBe('about 2 minutes')
    expect(screen.getByTestId('render-pill-spent').textContent).toBe('≈ 21 cr spent')
    expect(pill.querySelector('.st-progress-time')?.textContent).toMatch(/^1:\d\d$/)
    expect(screen.queryByTestId('l2r-render-again')).toBeNull() // the paid button is not there while it runs
  })

  it("a 145 f take reads about 3 to 4 minutes (the ledger's 219 s run)", async () => {
    l2r = ready({ take: { ...take, frames: 145 }, running: { since: new Date().toISOString(), what: `l2r ${TAKE} l2r-2` }, renders: [{ ...done, id: 'l2r-2', status: 'running', raw: null, finished: null }] })
    render(<WithPill />)
    expect((await screen.findByTestId('render-pill-estimate')).textContent).toBe('about 3 to 4 minutes')
  })

  it('when the render ends the pill goes and Render again returns', async () => {
    l2r = ready({ running: { since: new Date().toISOString(), what: `l2r ${TAKE} l2r-2` }, renders: [{ ...done, id: 'l2r-2', status: 'running', raw: null, finished: null }] })
    render(<WithPill />)
    await screen.findByTestId('render-pill')
    l2r = ready({ renders: [done] })
    await act(async () => { await renderL2R() })
    await waitFor(() => expect(screen.queryByTestId('render-pill')).toBeNull())
    expect(await screen.findByTestId('l2r-render-again')).toBeTruthy()
  })

  it('a render whose wait was lost offers Recover (free), which POSTs the job id only', async () => {
    l2r = ready({ renders: [{ ...done, status: 'failed', raw: null, finished: null, error: 'lost' }] })
    render(<L2RBlock lab={lab} />)
    await act(async () => { fireEvent.click(await screen.findByTestId('l2r-recover')) })
    expect(posts).toEqual([{ url: '/__lab/l2r/recover', body: { jobId: 'job-12345678' } }])
  })

  it('no locked takes (or the takes route not built yet): says to lock one in Shoot', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ error: 'not built yet', code: 'not_built' }, 501)))
    render(<L2RBlock lab={lab} />)
    await waitFor(() => expect(screen.getByTestId('l2r-no-takes').textContent).toMatch(/film a take, lock it and draw its first frame/))
    expect(screen.queryByTestId('l2r-status')).toBeNull()
  })

  it('chip strip lists what the server says it sends; keyframes are OFF by default and warn when ticked on (stale, or a set that differs from the opening), grade is opt-in at 70 %', async () => {
    const mk = (n: 'mid' | 'end', stale: string | null) => ({ still: { ...still, id: `k-${n}`, role: n, frame: 24 }, role: n, frame: 24, strength: n === 'mid' ? 0.7 : 1, stale, setDiffers: n === 'mid' ? "This keyframe's set differs from the opening: its shapes do not follow the 3D set at frame 24." : null })
    // the keyed price is answered too: a press that sends guides is never sent without the price it shows (m14)
    l2r = ready({ estimateKeyed: { credits: 27, perFrame: 0.27, frames: 97, basis: 'with keyframes' }, keyframes: { mid: mk('mid', null), end: mk('end', 'It was drawn for an older opening of this take.') }, gradeTarget: { png: '/m.png', bibleVersion: 2 },
      chips: [{ role: 'layout', label: 'Layout · 3D set preview', url: clay.mp4, sent: true, bind: 'v.file' }, { role: 'opening', label: 'Look · opening still', url: still.png, sent: true, bind: 'k_t.image' },
        { role: 'master', label: 'Master', url: '/m.png', sent: false }] })
    render(<L2RBlock lab={lab} />)
    await screen.findByTestId('l2r-chips')
    expect(screen.getByTestId('l2r-chip-layout').getAttribute('data-sent')).toBe('true')
    expect(screen.getByTestId('l2r-chip-master').getAttribute('data-sent')).toBe('false')
    // off by default: nothing is warned and nothing is sent until a keyframe is ticked on
    expect(screen.queryByTestId('l2r-key-end-stale')).toBeNull(); expect(screen.queryByTestId('l2r-key-mid-differs')).toBeNull()
    expect((screen.getByTestId('l2r-key-mid').querySelector('input') as HTMLInputElement).checked).toBe(false)
    await act(async () => { await renderL2R() })
    expect(posts.at(-1)!.body).toEqual({ takeId: TAKE, stillId: 'still-1', seed: 42, hold: 'wide' }) // no keyframes, no grade unless switched on
    fireEvent.click(screen.getByTestId('l2r-key-mid').querySelector('input')!)
    fireEvent.click(screen.getByTestId('l2r-key-end').querySelector('input')!)
    expect(screen.getByTestId('l2r-key-end-stale').textContent).toMatch(/older opening/)
    expect(screen.queryByTestId('l2r-key-mid-stale')).toBeNull()
    expect(screen.getByTestId('l2r-key-mid-differs').textContent).toMatch(/set differs from the opening/)
    fireEvent.click(screen.getByTestId('l2r-grade').querySelector('input[type=checkbox]')!)
    fireEvent.click(screen.getByTestId('l2r-key-end').querySelector('input')!) // switched off again: not sent
    await act(async () => { await renderL2R() })
    expect(posts.at(-1)!.body).toEqual({ takeId: TAKE, stillId: 'still-1', seed: 42, mid: 'k-mid', grade: { strength: 0.7 }, hold: 'wide' })
  })

  it('the approved still and the keyframe chips open full size; arrows walk them; Compare flips to the 3D set frame', async () => {
    const mk = (n: 'mid' | 'end') => ({ still: { ...still, id: `k-${n}`, role: n, frame: 48 }, role: n, frame: n === 'mid' ? 48 : 96, strength: 1, stale: null })
    l2r = ready({ clay: { ...clay, finishedAt: 'f1' }, keyframes: { mid: mk('mid'), end: mk('end') },
      chips: [{ role: 'layout', label: 'Layout', url: clay.mp4, sent: true }, { role: 'opening', label: 'Look · opening still', url: still.png, sent: true },
        { role: 'mid', label: 'Mid keyframe', url: '/mid.png', sent: true }, { role: 'master', label: 'Master', url: '/m.png', sent: false }] })
    render(<L2RBlock lab={lab} />)
    fireEvent.click(await screen.findByTestId('l2r-still'))
    expect(screen.getByTestId('lightbox-label').textContent).toBe('Look · opening still · 1 of 3')
    fireEvent.click(screen.getByTestId('lightbox-compare'))
    expect(screen.getByTestId('lightbox-img').getAttribute('src')).toBe(`/lab-assets/shots/${TAKE}/clay/clay-f0.png?v=f1`)
    fireEvent.click(screen.getByTestId('lightbox-next'))
    expect(screen.getByTestId('lightbox-img').getAttribute('src')).toBe('/mid.png')
    fireEvent.click(screen.getByTestId('lightbox-compare'))
    expect(screen.getByTestId('lightbox-img').getAttribute('src')).toBe(`/lab-assets/shots/${TAKE}/clay/clay-mid.png?v=f1`)
    fireEvent.click(screen.getByTestId('lightbox-next'))
    expect(screen.getByTestId('lightbox-label').textContent).toBe('Master · not sent · 3 of 3')
    expect(screen.queryByTestId('lightbox-compare')).toBeNull()
    fireEvent.click(screen.getByTestId('lightbox-close'))
    expect(screen.queryByTestId('lightbox')).toBeNull()
  })

  it('shows the composed prompt and an override box that previews its @tags', async () => {
    const calls: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/__lab/takes') return ok({ takes: [take] })
      if (url === '/__lab/l2r/prompt') { calls.push(JSON.parse(String(init?.body))); return ok({ text: 'a courier runs', tags: ['ana'], unknown: ['ghost'], warnings: [{ code: 'negation', message: 'Negatives can draw the thing they name.' }] }) }
      if (url.startsWith('/__lab/l2r?take=')) return ok(l2r)
      return ok({ error: 'no' }, 404)
    }))
    render(<L2RBlock lab={lab} />)
    expect(((await screen.findByTestId('l2r-composed-text')) as HTMLTextAreaElement).value).toBe('A man. Real live-action footage.')
    fireEvent.change(screen.getByTestId('l2r-override'), { target: { value: '@ana runs @ghost' } })
    expect((await screen.findByTestId('l2r-override-unknown')).textContent).toMatch(/@ghost is not in this scene/)
    expect((screen.getByTestId('l2r-composed-text') as HTMLTextAreaElement).value).toBe('a courier runs')
    expect(calls).toEqual([{ takeId: TAKE, text: '@ana runs @ghost' }])
    expect(screen.getByTestId('l2r-prompt-warnings').textContent).toMatch(/Negatives can draw/)
  })
})
