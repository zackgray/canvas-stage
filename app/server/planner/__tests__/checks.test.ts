// The gates, offline against canned model answers: plan text (E132 port), the brief, the flesh-out, and the support check
// that never lets horses, riders, water, animals or vehicles pass silently (keep.test.ts: must-keep and false alarms).
import { describe, expect, it } from 'vitest'
import type { SceneBrief } from '../../../src/shared/bibleContract.ts'
import { checkBriefText, checkFleshText, parseBrief } from '../briefCheck.ts'
import { DEVELOP_SYSTEM, FLESH_SYSTEM } from '../briefPrompt.ts'
import { checkPlanText, extractJson, planSystemPrompt, repairChecked, retryMessage } from '../planText.ts'
import { enforceSupport } from '../unsupported.ts'
import { BAD_PLAN, BRIEF, GOOD_PLAN, UGLY_PLAN } from './rig.ts'
import E134 from './e134-answers.json'

const json = (o: object) => JSON.stringify(o)

describe('plan text (E132 port)', () => {
  it('the system prompt is the doc between the markers plus the compact note; JSON is pulled out of fences and chatter', () => {
    const s = planSystemPrompt()
    expect(s).toMatch(/^You design a 3D film set/); expect(s).toContain('## Output format'); expect(s).not.toContain('=== PROMPT ===')
    expect(extractJson('Sure!\n```json\n{"a":1}\n```\nthanks')).toEqual({ a: 1 })
    expect(() => extractJson('no json here')).toThrow()
  })
  it('a compact answer passes with the constants filled; an out-of-range number fails naming the field; repair is the last resort', () => {
    const ok = checkPlanText(GOOD_PLAN, 'A ruined hamlet at dusk.')
    expect(ok.ok).toBe(true)
    if (ok.ok) { expect(ok.plan.sentence).toBe('A ruined hamlet at dusk.'); expect(ok.plan.sky.url).toMatch(/^\/lab-assets\//); expect(ok.plan.flat).toEqual([-3, -16, 3, 8]) }
    const bad = checkPlanText(BAD_PLAN, 'x')
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      expect(bad.errors.join(' ')).toMatch(/kit\[0\]\.args\[0\] \(length\): 99 is outside 1\.\.40/)
      expect(retryMessage('x', BAD_PLAN, bad.errors)).toMatch(/^x\n\nYour previous answer:\n\{"seed":17.*\n\nYour plan was rejected: kit\[0\]/s)
      expect(repairChecked(bad.raw)?.notes.length).toBeGreaterThan(0)
    }
    const ugly = checkPlanText(UGLY_PLAN, 'x')
    expect(ugly.ok).toBe(false)
    if (!ugly.ok) expect(repairChecked(ugly.raw)?.plan.kit.some((k) => (k.kind as string) === 'spaceship')).toBe(false)
    expect(checkPlanText('I cannot help', 'x')).toMatchObject({ ok: false, errors: [expect.stringMatching(/not valid JSON/)] })
  })
})

describe('the scene brief gate', () => {
  it('a good full brief passes untouched, background line and 3 beats kept', () => {
    const r = checkBriefText(`Here you go:\n${json(BRIEF)}`, 'soldier walks through a battlefield')
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.brief.background).toMatch(/fighting and running/); expect(r.brief.warnings).toEqual([]); expect(r.brief.elements.every((e) => e.supported)).toBe(true) }
  })
  it('beats come back in plain words (E134: Gemma tagged them)', () => {
    const r = parseBrief({ ...BRIEF, beats: ['The @soldier walks.', 'The @drummer_boy watches.', 'End.'] })
    expect(r.ok && r.brief.beats).toEqual(['The soldier walks.', 'The drummer boy watches.', 'End.'])
  })
  it('shape errors name the field so the retry can quote them', () => {
    const r = parseBrief({ ...BRIEF, brief: `${BRIEF.brief} @ghost waits.`, beats: ['one'], elements: [...BRIEF.elements, { ...BRIEF.elements[0], type: 'hero' }] })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      const e = r.errors.join(' | ')
      expect(e).toMatch(/brief: @ghost has no element/); expect(e).toMatch(/beats: required list of 3 or 4/)
      expect(e).toMatch(/elements\[2\]\.type: "hero"/); expect(e).toMatch(/elements\[2\]\.tag: @soldier is used twice/)
    }
    expect(parseBrief({ ...BRIEF, background: undefined })).toMatchObject({ ok: false })
  })
  it('a horse the model calls supported is marked unsupported with a warning and a swap (never silent)', () => {
    const rider = { ...BRIEF, brief: `${BRIEF.brief} @rider gallops past.`,
      elements: [...BRIEF.elements, { name: 'The rider', tag: 'rider', type: 'person', look: 'a knight on a grey horse', supported: true }] }
    const r = parseBrief(rider)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.brief.elements.find((e) => e.tag === 'rider')?.supported).toBe(false)
    expect(r.brief.warnings).toEqual([expect.objectContaining({ element: 'The rider', issue: expect.stringMatching(/mounted|horse/), swap: expect.stringMatching(/on foot/) })])
  })
  it('water, vehicles and animals: from elements, the background, beats and the idea itself', () => {
    const b = { ...BRIEF, elements: [...BRIEF.elements, { name: 'Wolf', tag: 'wolf', type: 'creature', look: 'a grey wolf', supported: true },
      { name: 'Truck', tag: 'truck', type: 'prop', look: 'a parked army truck', supported: true }], background: 'men swimming across the river far behind him' } as SceneBrief
    const w = enforceSupport(b, 'a soldier rides along the shore').warnings
    expect(w.map((x) => x.element)).toEqual(['Wolf', 'Truck', 'rides', 'swimming'])
    expect(w.every((x) => x.swap.length > 0)).toBe(true)
  })
  it("the model's own warning for a swapped horse is kept, not doubled", () => {
    const b = { ...BRIEF, warnings: [{ element: "The knight's horse", issue: 'mounted figures are not supported', swap: 'he walks in on foot' }] } as SceneBrief
    expect(enforceSupport(b, 'a knight rides into a burning village').warnings).toHaveLength(1)
  })
  it('the develop prompt names what cannot move in 3D, the keep-the-idea rules and the background rule; the flesh example passes', () => {
    expect(DEVELOP_SYSTEM).toMatch(/Horses, other animals, water and vehicles CAN be in the scene/); expect(DEVELOP_SYSTEM).toMatch(/PEOPLE IN MOTION/)
    expect(DEVELOP_SYSTEM).toMatch(/## Keep the idea\n/); expect(DEVELOP_SYSTEM).not.toMatch(/palisade|barricade|weapon racks/)
    const fx = FLESH_SYSTEM.split('SCENE: a city hospital corridor in the 1970s, late at night\n')[1].split('\n')[0]
    expect(checkFleshText(fx, 'Ana')).toMatchObject({ ok: true, warnings: [] })
    expect(FLESH_SYSTEM).not.toMatch(/gambeson|helmet|wear and dirt/); expect(FLESH_SYSTEM).toMatch(/condition only as the scene implies/)
  })
})

describe('the flesh-out gate', () => {
  it('a description of 20..900 characters passes; horseback is warned; too short fails', () => {
    expect(checkFleshText('{"description":"A broad man on horseback in a red cloak, grey beard, scarred cheek."}', 'Ser Hal'))
      .toMatchObject({ ok: true, warnings: [{ element: 'Ser Hal', issue: expect.stringMatching(/nobody can ride/) }] })
    expect(checkFleshText('{"description":"tall"}', 'x')).toMatchObject({ ok: false })
  })
})

describe('real Gemma 4 E4B answers (E134)', () => {
  it('both briefs and the flesh-out pass first time; the cavalry and the river are warned with swaps', () => {
    const d1 = checkBriefText(E134.answers.d1, 'cavalry charge across a muddy field at dawn, a young drummer boy watches from behind a wagon')
    const d2 = checkBriefText(E134.answers.d2, 'a woman walks along the river bank at dusk while soldiers search the reeds behind her')
    expect(d1.ok && d1.brief.warnings.map((w) => w.element)).toEqual(['cavalry'])
    expect(d2.ok && d2.brief.warnings.map((w) => w.element)).toEqual(['river bank'])
    expect(d1.ok && d1.brief.beats.some((b) => b.includes('@'))).toBe(false)
    expect(checkFleshText(E134.answers.f1, 'Tom')).toMatchObject({ ok: true, warnings: [] })
  })
})
