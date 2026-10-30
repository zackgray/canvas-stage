// "The staged people" is ONE definition (stagedPeople.ts), read by the render prompt, the still judge / face redraw and the face pass.
// One take, through each consumer's real function: the hero, a standing tagged extra, a walking tagged extra and an untagged crowd
// figure. The judge and the face pass list the same subjects; the prompt describes exactly the tagged ones (each once), never the crowd.
import { describe, expect, it } from 'vitest'
import type { BibleRecord } from '../../../src/shared/bibleContract.ts'
import type { ExtraPlan } from '../../../src/stage3d/contract.ts'
import { stagedOf } from '../../hero/judge.ts'
import { peopleFrom } from '../../l2r/facePeople.ts'
import { stagedCast } from '../../l2r/stagedPrompt.ts'
import type { KitWorld } from '../types.ts'
import { stagedPeople } from '../stagedPeople.ts'

const el = (tag: string, cardId: string) => ({ tag, kind: 'cast' as const, cardId, refs: [], line: '' })
const bible = { worldId: 'w', version: 1, prompt: '', master: null, candidates: [], lighting: '', materials: '', extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't',
  elements: [el('ana', 'ana'), el('tom', 'tom'), el('bea', 'bea')] } as unknown as BibleRecord
const extra = (o: Partial<ExtraPlan>): ExtraPlan => ({ path: [[1, 1], [1, 5]], gait: 'walk', delay: 0, costume: 'modern', variant: 0, ...o })
const extras = [extra({ tag: 'tom', stand: true, variant: 2, path: [[2, 2]] }), extra({ variant: 1 }), extra({ tag: 'bea', variant: 4 })]
const perf = { castId: 'ana', extras }
const DESC = { ana: 'a woman in a red coat', tom: 'a tall man in a grey cap', bea: 'a girl in a yellow raincoat' }

describe('the staged people, across their consumers', () => {
  it('one list: the hero, then every tagged extra standing or walking; the crowd figure is no one', () => {
    expect(stagedPeople(perf, bible).map((s) => [s.subject, s.cardId])).toEqual([['hero', 'ana'], ['extra:0:2', 'tom'], ['extra:2:4', 'bea']])
  })
  it('the judge (and the face redraw it feeds), the face pass and the render prompt agree on who', () => {
    const judged = stagedOf({ perf } as unknown as KitWorld, bible).map((s) => s.entity)
    const fixable = peopleFrom({ castId: perf.castId, extras, bible, colors: {}, heads: {}, faces: {}, depth: true }).map((p) => p.subject)
    const named = stagedCast({ heroCardId: 'ana', extras, bible, descriptions: DESC }).map((s) => s.description)
    const want = stagedPeople(perf, bible)
    expect(judged).toEqual(want.map((s) => s.subject))
    expect(fixable).toEqual(want.map((s) => s.subject))
    expect(named).toEqual(want.map((s) => DESC[s.cardId as keyof typeof DESC]))
  })
})
