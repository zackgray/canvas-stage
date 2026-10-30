// GET /__lab/l2r/shots?world= over a temp public dir: one world's locked takes, newest lock first, each with its newest render's
// state, the render to play and download, the billed credits when measured, and the approved still as its picture. Free.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { L2RRender, TakeRecord } from '../../../src/shared/shotContract.ts'
import { shotDirs } from '../spec.ts'
import { writeRender } from '../store.ts'
import { shotRows, shotState } from '../shots.ts'
import { call } from '../../project/__tests__/rig.ts'
import { mount, STILL, TAKE, WORLD, world } from './rig.ts'

const render = (id: string, over: Partial<L2RRender> = {}): L2RRender => ({ id, takeId: TAKE, stillId: STILL, clay: '/c.mp4', raw: `/${id}-raw.mp4`, finished: null,
  jobId: 'j', credits: 21, status: 'done', createdAt: `2026-10-22T19:2${id.slice(-1)}:00.000Z`, ...over })

/** a second take: on `worldId`, locked at `lockedAt`, no still, no renders */
function addTake(pub: string, id: string, worldId: string, lockedAt: string) {
  const d = shotDirs(pub, id)
  mkdirSync(d.root, { recursive: true })
  const t: Partial<TakeRecord> = { id, worldId, packId: null, fps: 24, frames: 97, samples: [], focal: 35, viewAspect: 1.77, perfStart: 0, startKey: 'k', lockedAt, createdAt: lockedAt }
  writeFileSync(d.take, JSON.stringify(t))
}

describe('the shots list', () => {
  it('shotState: none, rendering, raw, finished, failed', () => {
    expect(shotState(undefined)).toBe('none')
    expect(shotState(render('l2r-1', { status: 'running' }))).toBe('rendering')
    expect(shotState(render('l2r-1'))).toBe('raw')
    expect(shotState(render('l2r-1', { finished: '/f.mp4' }))).toBe('finished')
    expect(shotState(render('l2r-1', { status: 'failed' }))).toBe('failed')
  })

  it("lists only the world's takes, newest lock first, with the newest render's state and the newest that came back", () => {
    const w = world()
    addTake(w.pub, 'take-2026-10-23T08-00-00-000', WORLD, '2026-10-23T08:00:00.000Z')
    addTake(w.pub, 'take-2026-10-24T08-00-00-000', 'loc-other', '2026-10-24T08:00:00.000Z')
    writeRender(w.pub, render('l2r-1', { finished: '/fin-1.mp4' }))
    writeRender(w.pub, render('l2r-2', { status: 'failed', raw: null, error: 'Cloud said no' }))
    const rows = shotRows(w.pub, WORLD)
    expect(rows.map((r) => r.takeId)).toEqual(['take-2026-10-23T08-00-00-000', TAKE])
    expect(rows[0]).toMatchObject({ state: 'none', video: null, credits: null, thumb: null })
    // the newest render failed: its state says so, and the older finished one is still the one to play and download
    expect(rows[1]).toMatchObject({ state: 'failed', video: '/fin-1.mp4', renderId: 'l2r-1', finished: true, credits: 21, thumb: `/lab-assets/shots/${TAKE}/hero/${STILL}.png`, frames: 49 })
  })

  it('credits only when the balance was measured', () => {
    const w = world()
    writeRender(w.pub, render('l2r-1', { creditsEstimated: true }))
    expect(shotRows(w.pub, WORLD)[0]).toMatchObject({ state: 'raw', video: '/l2r-1-raw.mp4', credits: null })
  })

  it('a folder whose record names another take is not listed', () => {
    const w = world()
    addTake(w.pub, 'take-2026-10-23T08-00-00-000', WORLD, '2026-10-23T08:00:00.000Z')
    writeFileSync(shotDirs(w.pub, 'take-2026-10-23T08-00-00-000').take, JSON.stringify({ id: TAKE, worldId: WORLD, lockedAt: 'z' }))
    expect(shotRows(w.pub, WORLD).map((r) => r.takeId)).toEqual([TAKE])
    expect(shotRows(path.join(w.root, 'nothing'), WORLD)).toEqual([])
  })

  it('GET /shots?world= answers the rows; no world is a 400', async () => {
    const w = world()
    const m = mount(w, w.runtime())
    const ok = await call(m.h, `/shots?world=${WORLD}`)
    expect(ok.status).toBe(200)
    expect((ok.body as { shots: { takeId: string }[] }).shots.map((s) => s.takeId)).toEqual([TAKE])
    const bad = await call(m.h, '/shots')
    expect(bad.status).toBe(400)
  })
})
