// Track C: every prop the sentence's Props list names is in the plan (a labelled stand-in the planner left out, a tag on a piece it
// made untagged), the density check warns without refusing, and the browser's sentence and the server's reader agree on the list.
import { afterEach, describe, expect, it } from 'vitest'
import type { PlanResponse } from '../../../src/shared/bibleContract.ts'
import { parsePlan } from '../../../src/stage3d/plan.ts'
import { propsClause, propsOf, sentenceOf } from '../../../src/stage3d/planProps.ts'
import { visibleInMaster } from '../../../src/stage3d/planVisible.ts'
import { planSentence } from '../../../src/studio/scene/design/buildCheck.ts'
import { mkPiece } from '../../../src/studio/scene/design/model.ts'
import { resetClaims } from '../../jobs/inflight.ts'
import { placePiece, pieceItem } from '../../pieces/place.ts'
import { finishPlan } from '../finishPlan.ts'
import { describedSize, shapeFor } from '../propStandIns.ts'
import { GOOD_PLAN, setup } from './rig.ts'

afterEach(() => resetClaims())

const HIVE = { tag: 'hive', name: 'Beehive', line: 'a white-painted wooden hive, 1.2 m tall' }
const FRAME = { tag: 'frame', name: 'Frame', line: 'a honey frame dripping wax' }
const SENTENCE = `An orchard in late sun. ${propsClause([HIVE, FRAME], 400).trim()}`
const base = parsePlan(JSON.parse(GOOD_PLAN.replace('"kit":[', '"sky":{"url":"/lab-assets/sky/procedural"},"kit":[').replace('{"seed"', '{"seed"')) as never)

describe('the Props list', () => {
  it('is written by the browser and read back whole by the server', () => {
    expect(propsOf(SENTENCE)).toEqual([HIVE, { ...FRAME }])
    expect(sentenceOf(SENTENCE)).toBe('An orchard in late sun.')
    expect(propsOf('A plain place.')).toEqual([])
  })
  it('planSentence ends with a prop per board prop, inside the planner limit, and names no prop when there is none', () => {
    const pieces = [mkPiece('hive', 'Beehive', 'prop', { onBoard: true, line: HIVE.line }), mkPiece('frame', 'Frame', 'prop', { onBoard: true, line: FRAME.line }), mkPiece('maker', 'Maker', 'person', { onBoard: true })]
    const s = planSentence('An orchard in late sun. @maker walks.', pieces)
    expect(s.length).toBeLessThanOrEqual(600)
    expect(propsOf(s).map((p) => p.tag)).toEqual(['hive', 'frame'])
    expect(planSentence('An orchard in late sun.', [])).toBe('An orchard in late sun.')
    const long = planSentence(`${'The orchard runs on and on beneath the trees. '.repeat(40)}`, pieces)
    expect(long.length).toBeLessThanOrEqual(600)
    expect(propsOf(long)).toHaveLength(2)
  })
})

describe('stand-in pieces', () => {
  it('a plan that left both props out gets two labelled pieces, tagged for Build in 3D, out of the corridor', () => {
    expect(base.ok).toBe(true)
    if (!base.ok) return
    const before = base.plan.kit.length
    const { plan, notes } = finishPlan(base.plan, SENTENCE)
    expect(plan.kit).toHaveLength(before + 2)
    const added = plan.kit.slice(before)
    // F13: the label drops the size (it shaped the piece: scale below); prompts name labels
    expect(added.map((i) => [i.label, i.pieceTag])).toEqual([['a white-painted wooden hive', 'prop:hive'], ['a honey frame dripping wax', 'prop:frame']])
    expect(added[0].scale).toBeGreaterThan(1) // 1.2 m from a 0.7 m crate
    expect(parsePlan(plan).ok).toBe(true)
    expect(notes[0]).toMatch(/hive, frame/)
  })
  it('a piece the planner made for a prop is adopted by its label instead of doubled', () => {
    if (!base.ok) return
    const planned = { ...base.plan, kit: [...base.plan.kit, { kind: 'crates', args: [3, 1], at: [-8, -14] as [number, number], label: 'white-painted hive' }] }
    const { plan } = finishPlan(planned, `A yard. ${propsClause([HIVE], 300).trim()}`)
    expect(plan.kit).toHaveLength(planned.kit.length)
    expect(plan.kit.at(-1)?.pieceTag).toBe('prop:hive')
  })
  it('Build in 3D replaces the stand-in in place (same tag), not beside it', () => {
    if (!base.ok) return
    const { plan } = finishPlan(base.plan, SENTENCE)
    const at = plan.kit.find((i) => i.pieceTag === 'prop:hive')!.at
    const out = placePiece(plan, pieceItem('hive', 'hive', '/lab-assets/x/hive.glb', null, 1))
    expect(out.placed).toBe('replaced')
    expect(out.kit).toHaveLength(plan.kit.length)
    expect(out.kit.find((i) => i.pieceTag === 'prop:hive')).toMatchObject({ at, glb: { url: '/lab-assets/x/hive.glb' } })
  })
  it('shapes and sizes come from the words', () => {
    expect(shapeFor('Oak barrel')).toBe('barrels')
    expect(shapeFor('Market stall')).toBe('tent')
    expect(shapeFor('Beehive')).toBe('crates')
    expect(describedSize('a hive, 1.2 m tall')).toBe(1.2)
    expect(describedSize('a sign 40 cm wide')).toBeCloseTo(0.4)
    expect(describedSize('a hive')).toBeNull()
  })
})

describe('the thin-set warning', () => {
  it('warns on a plan with few pieces in the master view, and never refuses', () => {
    if (!base.ok) return
    const { plan, notes } = finishPlan(base.plan, 'An orchard.')
    expect(visibleInMaster(plan).length).toBeLessThan(6)
    expect(notes.join(' ')).toMatch(/thin set: only \d+ pieces? in the master view/)
    const full = { ...plan, kit: Array.from({ length: 8 }, (_, i) => ({ kind: 'tree', args: [i, 6, 4], at: [(i % 2 ? 1 : -1) * (5 + i), -12 - i * 2] as [number, number] })) }
    expect(finishPlan(full, 'An orchard.').notes).toEqual([])
  })
  it('the route returns the plan with its stand-ins and its note (no extra job, nothing refused)', async () => {
    const s = setup()
    s.answers.push({ p0: GOOD_PLAN })
    const r = await s.call('/plan', { prompts: [SENTENCE] })
    expect(r.status).toBe(200)
    const b = r.body as PlanResponse
    expect(s.jobs.submits).toBe(1)
    expect(b.scenes[0].plan?.kit.filter((i) => i.pieceTag).map((i) => i.pieceTag)).toEqual(['prop:hive', 'prop:frame'])
    expect(b.scenes[0].plan?.sentence).toBe('An orchard in late sun.')
    expect(b.scenes[0].notes.join(' ')).toMatch(/stand-in pieces added/)
  })
})
