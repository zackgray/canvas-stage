// @vitest-environment jsdom
// Recipe wave, Track B, on the Render screen: "Hold the clay: wide / close-up" rides the press (wide by default, close-up from 85 mm);
// the finish's grade switch is free and followed by a free Finish again that sends what was changed.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { L2RListResponse, L2RRender, TakeRecord } from '../../shared/shotContract'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { resetSceneJobs } from '../../jobs/sceneJobs'
import { holdFor, NO_PICKS, finishBody, finishPending, finishWords, gradeFor } from './finishChoice'
import { L2RBlock } from './L2RBlock'
import type { L2RStatusExtra } from './l2rExtra'
import { render as renderL2R, resetL2RStore } from './l2rStore'

const TAKE = 'take-2026-10-22T19-00-00-000'
const take = (focal: number): TakeRecord => ({ id: TAKE, worldId: 'loc-1', packId: null, fps: 24, frames: 97, samples: [], focal, viewAspect: 1.77, perfStart: 0, startKey: 'k', lockedAt: '2026-10-22T19:00:00.000Z', createdAt: '2026-10-22T19:00:00.000Z' })
const clay = { takeId: TAKE, startKey: 'k', mp4: `/lab-assets/shots/${TAKE}/clay/clay.mp4`, frames: 97, width: 1920 as const, height: 1088 as const, status: 'done' as const }
const still = { id: 'still-1', takeId: TAKE, startKey: 'k', png: `/lab-assets/shots/${TAKE}/hero/still-1.png`, seed: 1, jobId: null, credits: 1, approved: true, createdAt: 't' }
const done = (o: Partial<L2RRender> = {}): L2RRender => ({ id: 'l2r-1', takeId: TAKE, stillId: 'still-1', clay: clay.mp4, raw: '/raw.mp4', finished: '/fin.mp4', jobId: 'job-12345678', credits: 21, status: 'done', createdAt: 't', ...o })
const GRADE = { target: '/m.png', method: 'reinhard-lab' as const, bibleVersion: 2, strength: 0.6 }
const ready = (focal: number, o: Partial<L2RListResponse & L2RStatusExtra> = {}): L2RListResponse & L2RStatusExtra => ({ renders: [], take: take(focal), clay, still, missing: [], prompt: 'A man.', configured: true,
  estimate: { credits: 21, perFrame: 0.21, frames: 97, basis: 'about 0.21 cr per frame' }, running: null, finishing: [], gradeTarget: { png: '/m.png', bibleVersion: 2 }, ...o })

let l2r: L2RListResponse & L2RStatusExtra
let posts: { url: string; body: Record<string, unknown> }[]
const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
const lab = {} as ProjectionLabState
const mount = (answer: L2RListResponse & L2RStatusExtra) => {
  l2r = answer
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/__lab/takes') return ok({ takes: [answer.take] })
    if (init?.method === 'POST') { posts.push({ url, body: JSON.parse(String(init.body)) }); return ok({ render: done() }) }
    if (url.startsWith('/__lab/l2r?take=')) return ok(l2r)
    return ok({ error: 'no' }, 404)
  }))
  render(<L2RBlock lab={lab} />)
}
beforeEach(() => { resetL2RStore(); posts = [] })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetL2RStore(); resetSceneJobs() })

describe('Hold the clay', () => {
  it('wide by default; the picker is named presets with the numbers only in a tooltip; the choice rides the press', async () => {
    mount(ready(35))
    const wide = await screen.findByTestId('l2r-hold-pick-wide')
    expect(wide.getAttribute('aria-pressed')).toBe('true')
    expect(wide.textContent).toBe('Hold the clay: wide')
    expect(screen.getByTestId('l2r-hold').textContent).not.toMatch(/\d/) // no guide strengths on the screen
    expect(wide.getAttribute('title')).toMatch(/guide 1\.0/)
    await act(async () => { await renderL2R() })
    expect(posts.at(-1)!.body).toMatchObject({ hold: 'wide' })
    fireEvent.click(screen.getByTestId('l2r-hold-pick-closeup'))
    await act(async () => { await renderL2R() })
    expect(posts.at(-1)!.body).toMatchObject({ hold: 'closeup' })
  })
  it('a take of 85 mm or longer opens on close-up', async () => {
    mount(ready(85))
    expect((await screen.findByTestId('l2r-hold-pick-closeup')).getAttribute('aria-pressed')).toBe('true')
    expect(holdFor(NO_PICKS, { focal: 84 })).toBe('wide')
    expect(holdFor({ ...NO_PICKS, hold: 'wide' }, { focal: 135 })).toBe('wide')
  })
})

describe('the finish row: grade, with a free Finish again (there is no depth of field)', () => {
  it('Finish again is only offered once there is a render; there is no depth-of-field row; the press sends no dof', async () => {
    mount(ready(35))
    await screen.findByTestId('l2r-grade')
    expect(screen.queryByTestId('l2r-dof')).toBeNull()
    expect(screen.queryByTestId('l2r-dof-pick-off')).toBeNull()
    expect(screen.queryByTestId('l2r-finish-grade')).toBeNull()
    await act(async () => { await renderL2R() })
    expect(posts.at(-1)!.body).not.toHaveProperty('dof')
  })
  it('an older render that recorded a depth-of-field mode still shows its grade and finishes with the grade alone', async () => {
    mount(ready(35, { renders: [done({ grade: GRADE, dofMode: 'still' })] }))
    const again = await screen.findByTestId('l2r-finish-grade')
    expect(again.textContent).toMatch(/Finish again/)
    expect((screen.getByTestId('l2r-grade').querySelector('input[type=checkbox]') as HTMLInputElement).checked).toBe(true) // the recorded grade is the default
    expect(screen.getByTestId('l2r-grade-strength')).toBeTruthy()
    fireEvent.click(screen.getByTestId('l2r-grade').querySelector('input[type=checkbox]')!)
    await act(async () => { fireEvent.click(screen.getByTestId('l2r-finish-grade')) })
    expect(posts.at(-1)).toEqual({ url: '/__lab/l2r/finish', body: { renderId: 'l2r-1', grade: false } })
  })
  it('the choices belong to the finish: changing them never turns the paid Render into "again"', async () => {
    mount(ready(35, { renders: [done()] }))
    await screen.findByTestId('l2r-finish-grade')
    fireEvent.click(screen.getByTestId('l2r-grade').querySelector('input[type=checkbox]')!)
    expect(screen.getByTestId('l2r-status').textContent).toMatch(/Rendered/)
  })
})

describe('finishChoice (pure)', () => {
  const rec = done({ grade: GRADE, dofMode: 'still' })
  it('untouched picks follow the render; touched ones win; an old render has its grade', () => {
    expect(gradeFor(NO_PICKS, rec)).toBe(0.6)
    expect(gradeFor(NO_PICKS, done({ grade: GRADE, gradeOff: true }))).toBe(null)
    expect(gradeFor({ ...NO_PICKS, gradeTouched: true, grade: 0.4 }, rec)).toBe(0.4)
    expect(gradeFor(NO_PICKS, null)).toBe(null)
  })
  it('the request carries only the touched switch; pending says when Finish again has something to do', () => {
    expect(finishBody('l2r-1', NO_PICKS, true)).toEqual({ renderId: 'l2r-1' })
    expect(finishBody('l2r-1', { ...NO_PICKS, gradeTouched: true, grade: null }, false)).toEqual({ renderId: 'l2r-1', grade: false })
    expect(finishBody('l2r-1', { ...NO_PICKS, gradeTouched: true, grade: 0.5 }, false)).toEqual({ renderId: 'l2r-1' }) // no master to grade to: nothing sent
    expect(finishPending(NO_PICKS, rec)).toBe(false)
    expect(finishPending({ ...NO_PICKS, gradeTouched: true, grade: null }, rec)).toBe(true)
  })
  it('the finishing note names what is applied (an old depth-of-field record is not named)', () => {
    expect(finishWords(NO_PICKS, done())).toBe('sharpen, grain')
    expect(finishWords(NO_PICKS, rec)).toBe('grade, sharpen, grain')
  })
})
