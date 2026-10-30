// Build the set lights the 3D set from the scene brief (the prompt wave's join): the plan request carries the v2 brief's key light,
// and every plan the run returns (first try, retry or repaired) has its light from planLight.ts lightRecipe; a brief light with no
// height, or none sent, keeps the planner's own recipe. Fake Cloud, no credits.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { PlanResponse } from '../../../src/shared/bibleContract.ts'
import { lightRecipe } from '../../../src/stage3d/planLight.ts'
import { resetClaims } from '../../jobs/inflight.ts'
import { GOOD_PLAN, setup, UGLY_PLAN } from './rig.ts'

afterEach(() => resetClaims())
const BEHIND_LOW = { key: 'a low sun', direction: 'behind her, towards camera', height: 'low', quality: 'hard', colour: '', others: '', effect: '' }
const PLANNER_OWN = { fill: 1.3, key: 1.0, keyDir: [140, 10] } // GOOD_PLAN's light

describe('the plan is lit by the brief\'s light', () => {
  it('a brief light with a height replaces the planner\'s light on the plan returned and on disk', async () => {
    const s = setup()
    s.answers.push({ p0: GOOD_PLAN })
    const b = (await s.call('/plan', { prompts: ['An orchard.'], light: BEHIND_LOW })).body as PlanResponse
    const want = lightRecipe(BEHIND_LOW as never)!
    expect(want.keyDir).toEqual([15, 12]) // behind the subject, low
    expect(b.scenes[0].plan?.light).toEqual(want)
    const onDisk = JSON.parse(readFileSync(path.join(s.pub, 'lab-assets', 'planner', b.runId, 'plan-p0.json'), 'utf8'))
    expect(onDisk.light).toEqual(want)
  })
  it('a repaired plan is lit too; no light, or one with no height, keeps the planner\'s own', async () => {
    const s = setup()
    s.answers.push({ p0: UGLY_PLAN }, { p0: UGLY_PLAN })
    const rep = (await s.call('/plan', { prompts: ['A'], light: { ...BEHIND_LOW, height: 'overhead', direction: 'from above' } })).body as PlanResponse
    expect([rep.scenes[0].repaired, rep.scenes[0].plan?.light?.keyDir?.[1]]).toEqual([true, 75])
    s.answers.push({ p0: GOOD_PLAN }, { p0: GOOD_PLAN })
    expect(((await s.call('/plan', { prompts: ['A'] })).body as PlanResponse).scenes[0].plan?.light).toEqual(PLANNER_OWN)
    expect(((await s.call('/plan', { prompts: ['A'], light: { ...BEHIND_LOW, height: '' } })).body as PlanResponse).scenes[0].plan?.light).toEqual(PLANNER_OWN)
  })
  it('a light that is not a brief light is refused before any spend (400)', async () => {
    const s = setup()
    expect((await s.call('/plan', { prompts: ['A'], light: 'low sun' })).status).toBe(400)
    expect((await s.call('/plan', { prompts: ['A'], light: { height: 'sideways' } })).status).toBe(400)
    expect(s.jobs.submits).toBe(0)
  })
})
