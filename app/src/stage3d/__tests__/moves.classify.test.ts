// The word classifier (plan section 8 "Word classifier"): each class's phrasings, ambiguity returning chips, every refusal
// row with its plain-words message, trait removal with the one-time note, manner kept, no default adverb added.
import { describe, expect, it } from 'vitest'
import { classify, matchingClasses, NOT_AVAILABLE_YET, planMove, stripTraits } from '../moves/index.ts'

describe('the verb table', () => {
  it('takes a frame out of the hive is the lift', () => {
    expect(classify('takes a frame out of the hive and holds it up to the light')).toEqual({ class: 'takeOut' })
  })
  it('every class has phrasings', () => {
    expect(classify('takes a frame out of the box')).toEqual({ class: 'takeOut' })
    expect(classify('picks up the crate')).toEqual({ class: 'pickUp' })
    expect(classify('lifts the box from the floor')).toEqual({ class: 'pickUp' })
    expect(classify('puts the crate down on the table')).toEqual({ class: 'putDown' })
    expect(classify('lays the frame down')).toEqual({ class: 'putDown' })
    expect(classify('places the pot on the bench')).toEqual({ class: 'putDown' })
    expect(classify('holds the frame up to the light')).toEqual({ class: 'holdUp' })
    expect(classify('raises the frame and looks at it')).toEqual({ class: 'holdUp' })
    expect(classify('waves at the hive')).toEqual({ class: 'gesture' })
    expect(classify('wipes her brow')).toEqual({ class: 'gesture' })
    expect(classify('looks around')).toEqual({ class: 'gesture' })
    expect(classify('claps')).toEqual({ class: 'gesture' })
  })
  it('two matching rows return chips for the panel to ask with', () => {
    expect(matchingClasses('takes a frame out of the hive and shows it')).toEqual(['takeOut', 'holdUp'])
    expect(classify('takes a frame out of the hive and shows it')).toEqual({ ambiguous: ['takeOut', 'holdUp'] })
  })
  it('unmatched words return unknown', () => {
    expect(classify('the sun sets over the apiary')).toEqual({ unknown: true })
  })
})

describe('the refusal rows', () => {
  const refused = (words: string) => {
    const r = planMove({ words })
    expect(r.kind).toBe('refused')
    return r.kind === 'refused' ? r.message : ''
  }
  it('animals as the mover', () => {
    expect(refused('the bee flies around her veil')).toBe('The motion computer makes human moves only. Creatures have their own moves on the Set.')
  })
  it('two people', () => {
    expect(refused('hands the frame to him')).toBe('This needs two people. The motion computer makes one person\'s moves at a time.')
    expect(refused('gives the frame to her')).toContain('two people')
    // her own hands are not a hand-over (the Stage's walkthrough sentence)
    expect(planMove({ words: 'She reaches into the hive, takes out a frame with both hands, and holds it up to look at it' }).kind).not.toBe('refused')
    expect(refused('dances with him by the hive')).toContain('two people')
  })
  it('needs the hands to work the object', () => {
    expect(refused('opens the lid of the hive')).toBe('This needs the hands to work the object itself, which the motion computer can\'t do yet. Try a move like \'reaches into the hive and lifts out a frame\'.')
  })
  it('walking while doing it', () => {
    expect(refused('carries the frame over to the bench')).toBe('Moves made here happen on the spot. Make the move here, then draw the path for the walk.')
    expect(refused('walks to the door with the frame')).toBe('Moves made here happen on the spot. Make the move here, then draw the path for the walk.')
  })
  it('resting on a piece', () => {
    expect(refused('sits on the bench')).toBe('This needs the body to rest on a set piece, which the motion computer can\'t do yet.')
  })
  it('longer than 10 seconds', () => {
    expect(refused('holds it up for a minute')).toBe('A move can last up to 10 seconds. Use a hold after it for longer.')
  })
  it('put down is not available yet, whatever the words or the target', () => {
    for (const words of ['puts the crate down on the table', 'lays the frame down', 'places the pot on the bench', 'sets the pot down gently']) {
      expect(refused(words)).toBe(NOT_AVAILABLE_YET)
    }
  })
  it('pick up off the floor or ground is not available yet; a surface below 0.05 m is the floor to the box', () => {
    expect(refused('picks up the crate from the floor')).toBe(NOT_AVAILABLE_YET) // no piece: the floor ahead of the point
    const mat = planMove({ words: 'picks up the crate', piece: { id: 'mat', name: 'mat', box: { min: [-0.3, 0, 0.5], max: [0.3, 0.01, 1.1] } } })
    expect(mat).toEqual({ kind: 'refused', message: NOT_AVAILABLE_YET })
  })
  it('pick up from a surface, hold up, take out and gestures still plan', () => {
    const pick = planMove({ words: 'picks up the crate from the table', piece: { id: 'table', name: 'table', box: { min: [-0.3, 0, 0.5], max: [0.3, 0.75, 1.1] } } })
    expect(pick.kind).toBe('spec')
    if (pick.kind === 'spec') expect(pick.spec).toMatchObject({ class: 'pickUp', prop: { pieceId: 'table', kind: 'surface' } })
    expect(planMove({ words: 'holds the frame up to the light' }).kind).toBe('spec')
    expect(planMove({ words: 'takes a frame out of the hive', piece: { id: 'hive', name: 'hive', box: { min: [-0.3, 0, 0.5], max: [0.3, 0.75, 1.1] } } }).kind).toBe('spec')
    expect(planMove({ words: 'waves at the hive' }).kind).toBe('spec')
  })
  it('nothing user-facing names the generator or its machinery', () => {
    const r = planMove({ words: 'opens the lid' })
    const text = r.kind === 'refused' ? r.message : ''
    for (const banned of ['kimodo', 'constraint', 'seed', 'candidate', 'bvh', 'bible']) {
      expect(text.toLowerCase()).not.toContain(banned)
    }
  })
})

describe('person traits', () => {
  it('age, build, mood and health words are removed, never sent, and the note says so once', () => {
    const r = stripTraits('the elderly beekeeper slowly takes a frame out of the hive')
    expect(r.removed).toEqual(['elderly'])
    expect(r.words).not.toContain('elderly')
    expect(r.words).toContain('slowly')
    expect(r.note).toBe('Left out \'elderly\'. How she looks comes from her cast card; describe the move, e.g. \'slowly, carefully\'.')
  })
  it('several removed traits are all named', () => {
    const r = stripTraits('the tired frail keeper picks up the crate')
    expect(r.removed).toEqual(['tired', 'frail'])
    expect(r.note).toContain('\'tired\', \'frail\'')
  })
  it('manner words are kept and become the adverb', () => {
    expect(stripTraits('slowly takes a frame out').manner).toBe('slowly')
    expect(stripTraits('carefully lifts it out').manner).toBe('carefully')
    expect(stripTraits('with effort pulls out the frame').manner).toBe('with effort')
  })
  it('no manner in the words means no adverb: none is invented', () => {
    expect(stripTraits('takes a frame out of the hive').manner).toBeUndefined()
    expect(stripTraits('takes a frame out of the hive').note).toBeUndefined()
  })
})

describe('the owner picks the kind of move (pass 3: "Do you mean" never rewrites the words)', () => {
  it('ambiguous words plan as the picked kind, the object read from the words as written', () => {
    const words = 'takes out a frame and sets it down'
    expect(planMove({ words }).kind).toBe('chips')
    const piece = { id: 'hive', name: 'hive', box: { min: [-0.25, 0, 0.45] as [number, number, number], max: [0.25, 0.8, 0.95] as [number, number, number] } }
    const r = planMove({ words, piece, cls: 'takeOut' })
    expect(r.kind).toBe('spec')
    if (r.kind === 'spec') expect(r.spec.class).toBe('takeOut')
    expect(planMove({ words, piece, cls: 'putDown' })).toEqual({ kind: 'refused', message: NOT_AVAILABLE_YET })
  })
})
