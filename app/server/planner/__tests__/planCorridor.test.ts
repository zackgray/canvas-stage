// The walking lane is advice for a user's edit but still the planner's own rule: its output keeps the lane clear (refused, then
// repaired by moving the piece), the plan guard refuses a lane plan, and a stand-in that cannot be tagged without crossing it stays untagged.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ScenePlan } from '../../../src/stage3d/contract.ts'
import { inCorridor } from '../../../src/stage3d/planRules.ts'
import { checkPlanText, repairChecked } from '../planText.ts'
import { ensureProps } from '../propStandIns.ts'
import { GOOD_PLAN, setup } from './rig.ts'

const runDir = (pub: string, runId: string) => path.join(pub, 'lab-assets', 'planner', runId)
const IN_LANE = GOOD_PLAN.replace('"at":[-9,-22],"yawDeg":20', '"at":[0.5,-10],"yawDeg":20')
const hut = (plan: ScenePlan) => plan.kit.find((k) => k.kind === 'hut')!

describe('the planner keeps the lane clear', () => {
  it('a planner answer with a hut in the lane is refused, then repaired by moving the hut out', () => {
    const r = checkPlanText(IN_LANE, 'a farm')
    expect(r.ok).toBe(false)
    expect(r.ok ? '' : r.errors.join(' ')).toMatch(/walk corridor/)
    const fixed = repairChecked(JSON.parse(IN_LANE))
    expect(fixed).not.toBeNull()
    expect(inCorridor(hut(fixed!.plan), fixed!.plan.flat)).toBe(false)
    expect(fixed!.notes.join(' ')).toMatch(/walk corridor, moved/)
  })
  it('the plan guard refuses to write a plan with a piece in the lane', () => {
    const s = setup()
    const store = s.ctx.store, runId = store.newRunId(new Date('2026-10-24T09:00:00Z'))
    store.writeIntent({ runId, kind: 'plan', request: { prompts: ['A'] }, items: [{ key: 'p0', user: 'A' }], seed: 1, estimateCredits: 3, createdAt: 't' })
    const ok = checkPlanText(GOOD_PLAN, 'a farm')
    expect(ok.ok).toBe(true)
    const lane = { ...(ok as { plan: ScenePlan }).plan, kit: [{ kind: 'hut', at: [0.5, -10] as [number, number] }] }
    expect(() => store.writePlan(runId, 'p0', lane as ScenePlan)).toThrow(/invalid plan/)
    expect(existsSync(path.join(runDir(s.pub, runId), 'plan-p0.json'))).toBe(false)
  })
  it('a prop stand-in is not adopted onto a piece standing in the lane', () => {
    const ok = checkPlanText(GOOD_PLAN, 'a farm') as { plan: ScenePlan }
    const plan = { ...ok.plan, kit: [{ kind: 'crates', label: 'hive', at: [0.5, -10] as [number, number] }] }
    const out = ensureProps(plan, [{ tag: 'hive', name: 'Beehive', line: 'a hive' }])
    expect(out.plan.kit[0].pieceTag).toBeUndefined()
  })
})
