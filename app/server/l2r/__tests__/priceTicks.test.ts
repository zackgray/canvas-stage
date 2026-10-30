// QA 2026-10-25: the Render price must follow the keyframe ticks. GET answers the price with no guide (estimate) and with one
// (estimateKeyed, the surcharge), the press with guides records the keyed estimate, and GET /price hands Shoot the same inputs.
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { HeroStill } from '../../../src/shared/shotContract.ts'
import { call } from '../../project/__tests__/rig.ts'
import { resetClaims } from '../../jobs/inflight.ts'
import { resetFinishing } from '../finish.ts'
import { l2rEstimate } from '../price.ts'
import { bibleOn, FRAMES, KEY, mount, TAKE, world, type World } from './rig.ts'

afterEach(() => { resetClaims(); resetFinishing() })

function putKey(w: World, id: string, role: 'mid' | 'end') {
  const s: HeroStill = { id, takeId: TAKE, startKey: KEY, png: `/lab-assets/shots/${TAKE}/hero/${id}.png`, seed: 1, jobId: null, credits: 1, approved: true,
    createdAt: '2026-10-22T19:20:00.000Z', role, frame: role === 'mid' ? 24 : FRAMES - 1, bibleVersion: bibleOn(w) }
  writeFileSync(path.join(w.dirs.hero, `${id}.json`), JSON.stringify(s)); writeFileSync(path.join(w.dirs.hero, `${id}.png`), 'png')
}

describe('Render price follows the keyframe ticks', () => {
  it('GET answers both prices; the keyed one carries the surcharge and is what a press with guides records', async () => {
    const w = world(); putKey(w, 'k-mid', 'mid'); putKey(w, 'k-end', 'end')
    const m = mount(w, w.runtime())
    const b = (await m.status()).body
    expect(b.estimate.credits).toBe(l2rEstimate(FRAMES).credits)
    expect(b.estimateKeyed.credits).toBe(l2rEstimate(FRAMES, [], true).credits)
    expect(b.estimateKeyed.credits).toBeGreaterThan(b.estimate.credits)
    const r = await m.render({ mid: 'k-mid', end: 'k-end' })
    expect(r.status).toBe(200)
    expect(r.body.render.estimateCredits).toBe(b.estimateKeyed.credits)
  })

  it('GET /price is free and lists the paid renders the estimate learns from', async () => {
    const w = world()
    const m = mount(w, w.runtime())
    const r = await call(m.h, '/price')
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ done: [] })
    expect(w.jobs.submits).toBe(0)
  })
})
