// @vitest-environment jsdom
// The guided wave's chain, end to end on the real path (the join, 2026-10-25): a Guided prop pick lands on the board as an approved
// prop piece of its own words (A); the planner's sentence names every prop and the finished plan holds a labelled stand-in tagged
// prop:<tag> for each (C); the Set's top view draws them (C); Approve the set is keyed on setKeyOf of that plan (B); and every move the
// top view makes (drag, turn, resize, remove, add, the mark) stales it, so the master draw, the master preview and the hero-still
// press are refused (409) with no job, no intent and no ledger row until it is approved again. Two unrelated props, nothing tuned to
// one concept. Fake Cloud, temp files: nothing paid.
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { biblePaths } from '../../src/shared/bibleContract.ts'
import { SET_CHANGED, SET_NOT_APPROVED } from '../../src/shared/setApproval.ts'
import { propsOf as sentenceProps } from '../../src/stage3d/planProps.ts'
import { BATTLEFIELD } from '../../src/stage3d/presets.ts'
import { SetPlace } from '../../src/studio/scene/SetPlace.tsx'
import { buildBlock, elementOfPiece, planSentence } from '../../src/studio/scene/design/buildCheck.ts'
import { freshGuided, propCard } from '../../src/studio/scene/design/guided.ts'
import { finishGuided } from '../../src/studio/scene/design/routes.ts'
import { freshDesign } from '../../src/studio/scene/design/state.ts'
import { setKeyOf } from '../../src/studio/shoot/setKey.ts'
import { masterDrawer } from '../bible/masterDraw.ts'
import { completeMasters } from '../bible/masterIntents.ts'
import { previewMaster } from '../bible/masterPreview.ts'
import { readSetApproval } from '../bible/read.ts'
import { handleBible } from '../bible/routes.ts'
import { currentSetKey } from '../bible/setGate.ts'
import { BibleStore } from '../bible/store.ts'
import { resetClaims } from '../jobs/inflight.ts'
import { kitInfo, kitTake, pngJob, stillPng } from '../hero/__tests__/kitRig.ts'
import { mount } from '../hero/__tests__/rig.ts'
import { finishPlan } from '../planner/finishPlan.ts'
import { KitStore } from '../stage3d/store.ts'

afterEach(() => { cleanup(); resetClaims() })

const PROPS = [
  { name: 'Rain barrel', desc: 'an oak rain barrel, 1.2 m tall, iron hoops' },
  { name: 'Signpost', desc: 'a painted wooden signpost with two arms' },
]

/** Guided's picks onto the board, as the last step's Build the set does (finishGuided), with each prop's tile picked */
function guidedBoard() {
  const g = { ...freshGuided([]), props: PROPS.map((p, i) => ({ ...propCard(p.name, p.desc), cands: [`/lab-assets/tiles/p${i}.png`], pick: 0 })) }
  g.st.loc = { ...g.st.loc, text: 'A harbour quay at dawn, stone bollards along the edge' }
  const d = { ...freshDesign(), screen: 'guided' as const, route: 'guided' as const, guided: g }
  return { ...d, ...finishGuided(d, g) }
}

/** a kit take (fake Cloud) whose set is the plan Build the set would save from that board; the Bible routes over the same files */
function chain() {
  const d = guidedBoard()
  const sentence = planSentence(d.brief, d.pieces)
  const t = kitTake({ approved: false, depth: false })
  const kits = new KitStore(t.pub)
  const planned = finishPlan({ ...BATTLEFIELD, sentence: '' }, sentence) // the planner's own plan, before its props are ensured
  kits.changePlan(t.kit.id, () => planned.plan)
  const store = new BibleStore(t.pub)
  const rt = t.runtime({ fetchInfo: async () => kitInfo() })
  const ctx = { store, drawMaster: masterDrawer({ publicDir: t.pub, store, runtime: () => rt, seed: () => 100, now: () => new Date('2026-10-26T10:00:00Z') }),
    complete: (id: string) => completeMasters(t.pub, store, rt.store, id),
    previewMaster: (b: Parameters<typeof previewMaster>[2], body: unknown) => previewMaster(t.pub, store, b, body),
    setKey: (id: string) => currentSetKey(t.pub, id), setApproval: (id: string) => readSetApproval(t.pub, id) }
  const bible = (sub: string, body: object = {}) => handleBible(ctx, 'POST', sub, new URLSearchParams(), { worldId: t.kit.id, ...body })
  const press = () => { t.queue.push(pngJob('aaaaaaaa-0000-4000-8000-000000000b01', stillPng())); return mount(t, rt).render({}) }
  const spent = () => {
    const master = path.join(t.pub, ...biblePaths(t.kit.id).master.split('/'))
    return { submits: t.jobs.submits, ledger: t.jobs.ledger(), masters: existsSync(master) ? readdirSync(master) : [],
      intents: existsSync(t.heroDir) ? readdirSync(t.heroDir).filter((f) => f.startsWith('intent-')) : [] }
  }
  return { d, sentence, t, kits, planned, bible, press, spent, plan: () => kits.read(t.kit.id).plan }
}
const NOTHING = { submits: 0, ledger: '', masters: [], intents: [] }
type Chain = ReturnType<typeof chain>

/** every paid press on this set is refused before any spend, in the given words */
async function allRefused(c: Chain, words: string) {
  const draw = await c.bible('/master', { count: 1 })
  expect([draw.status, (draw.body as { error: string }).error]).toEqual([409, words])
  const preview = await c.bible('/master/preview', {})
  expect([preview.status, (preview.body as { error: string }).error]).toEqual([409, words])
  const hero = await c.press()
  expect([hero.status, (hero.body as { code?: string }).code, (hero.body as { error: string }).error]).toEqual([409, 'set_not_approved', words])
  expect(c.spent()).toEqual(NOTHING)
}
/** approved at the set as it stands: the preview is allowed (free) and the hero press gets past the gate (to its own free no-depth stop) */
async function approveAndPass(c: Chain) {
  const a = await c.bible('/set/approve')
  expect(a.status).toBe(200)
  expect((a.body as { setApproval: { key: string } }).setApproval.key).toBe(setKeyOf(c.plan()))
  expect((await c.bible('/master/preview', {})).status).toBe(200)
  const hero = await c.press()
  expect((hero.body as { code?: string }).code).not.toBe('set_not_approved')
  expect(c.spent()).toEqual(NOTHING)
}

describe('Guided prop pick -> board -> planner stand-ins -> Set -> approval -> every move stales it -> paid presses refused', () => {
  it('a prop pick is an approved prop piece whose line is its own words; the planner is told every prop; the plan holds a labelled stand-in for each', () => {
    const c = chain()
    const props = c.d.pieces.filter((p) => p.type === 'prop')
    expect(props.map((p) => [p.tag, p.state, p.onBoard, p.line])).toEqual([['rain-barrel', 'approved', true, PROPS[0].desc], ['signpost', 'approved', true, PROPS[1].desc]])
    expect(props.map((p) => elementOfPiece(p)?.line)).toEqual(PROPS.map((p) => p.desc)) // the scene sheet's element: its own words only
    expect(buildBlock(c.d, c.d.pieces.filter((p) => p.onBoard))).toBeNull()
    expect(sentenceProps(c.sentence).map((p) => p.tag)).toEqual(['rain-barrel', 'signpost'])
    for (const tag of ['rain-barrel', 'signpost']) {
      const it = c.plan().kit.find((k) => k.pieceTag === `prop:${tag}`)
      expect(it, tag).toBeTruthy()
      expect(it!.label).toBeTruthy()
    }
  })

  it('the Set\'s top view draws each stand-in with its label and the subject\'s mark', () => {
    const c = chain()
    render(<SetPlace world={c.kits.read(c.t.kit.id) as never} api={{ edit: async () => {}, add: async () => {}, mark: async () => {} }} />)
    const labels = c.plan().kit.flatMap((k, i) => (k.pieceTag?.startsWith('prop:') ? [screen.getByTestId(`set-label-${i}`).textContent] : []))
    expect(labels).toHaveLength(2)
    expect(labels.join(' ')).toMatch(/rain barrel/i)
    expect(labels.join(' ')).toMatch(/signpost/i)
    expect(screen.getByTestId('set-mark-body')).toBeTruthy()
  })

  it('never approved: the master draw, its preview and the hero press are refused free; approve opens them at setKeyOf of the plan', async () => {
    const c = chain()
    await allRefused(c, SET_NOT_APPROVED)
    await approveAndPass(c)
  })

  it('each top-view move (drag, turn, resize, remove, add, the mark) stales the approval; every paid press is refused until approved again', async () => {
    const c = chain()
    await approveAndPass(c)
    const id = c.t.kit.id
    // the stand-ins themselves are what the top view moves here (found by tag each time: a removal shifts the indices)
    const prop = (tag: string) => { const kit = c.plan().kit, index = kit.findIndex((k) => k.pieceTag === `prop:${tag}`); return { index, it: kit[index] } }
    const barrel = () => prop('rain-barrel')
    const moves: [string, () => unknown][] = [
      ['drag', () => { const b = barrel(); return c.kits.movePiece(id, { index: b.index, kind: b.it.kind, at: [b.it.at[0], b.it.at[1] - 1.5] }) }],
      ['turn', () => { const b = barrel(); return c.kits.movePiece(id, { index: b.index, kind: b.it.kind, yawDeg: (b.it.yawDeg ?? 0) + 15 }) }],
      ['resize', () => { const b = barrel(); return c.kits.movePiece(id, { index: b.index, kind: b.it.kind, scale: Math.min(2, (b.it.scale ?? 1) * 1.15) }) }],
      ['remove', () => { const s = prop('signpost'); return c.kits.movePiece(id, { index: s.index, kind: s.it.kind, remove: true }) }],
      ['add', () => c.kits.movePiece(id, { add: { kind: 'tree' } })],
      ['mark', () => c.kits.setMark(id, { at: [1.5, -10], yawDeg: 20 })],
    ]
    for (const [what, move] of moves) {
      const before = setKeyOf(c.plan())
      move()
      expect(setKeyOf(c.plan()), what).not.toBe(before)
      await allRefused(c, SET_CHANGED)
      await approveAndPass(c)
    }
  })
})
