// Stage-only plan, section 5: the scene words lead the draw and the render, said as written, with each @tag in words; only a cast
// member who is not on the set is taken out (the user's "Set in", "Cast:" … stay: review F1). Pure.
import { describe, expect, it } from 'vitest'
import { dropMentions, sceneWords, stripOpener, whoPhrase } from '../sceneWords.ts'

const ELS = [
  { tag: 'ana', name: 'Ana', kind: 'cast' },
  { tag: 'ben', name: 'Ben', kind: 'cast' },
  { tag: 'kettle', name: 'Copper kettle', type: 'prop' },
]
const CARDS = { ana: 'A cook in a yellow raincoat, hood up.' }

describe('stripOpener (moved from stagedDefault.ts)', () => {
  it('takes off how the card was drawn and keeps who it is', () => {
    expect(stripOpener('A detailed character concept sheet for a cook, full profile')).toBe('a cook, full profile')
    expect(stripOpener('A full-length reference photograph of an old woman')).toBe('an old woman')
    expect(stripOpener('The character sheet for the mechanic')).toBe('the mechanic')
    expect(stripOpener('A tall woman in a grey coat')).toBe('A tall woman in a grey coat')
  })
})

describe('whoPhrase', () => {
  it('a concept-sheet opener is taken off and the leading article lower-cased', () => {
    expect(whoPhrase({ description: 'A detailed character concept sheet for a cook in a white apron.' })).toBe('a cook in a white apron')
  })
  it('a long first sentence with commas, semicolons and brackets is kept whole (never a word cap)', () => {
    const d = 'An old woman in her seventies, grey hair pinned up; a long wool coat (dark green), heavy boots, a canvas bag over one shoulder and a lamp in her hand. She walks slowly.'
    expect(whoPhrase({ description: d })).toBe('an old woman in her seventies, grey hair pinned up; a long wool coat (dark green), heavy boots, a canvas bag over one shoulder and a lamp in her hand')
  })
  it('two sentences: the first is kept; a stop inside a number is not an end', () => {
    expect(whoPhrase({ description: 'The cook is 1.8 m tall, broad. He hums.' })).toBe('the cook is 1.8 m tall, broad')
    expect(whoPhrase({ description: 'A cook! Loud.' })).toBe('a cook')
    expect(whoPhrase({ description: 'A cook with no stop at all' })).toBe('a cook with no stop at all')
  })
  it('an empty description is the name', () => {
    expect(whoPhrase({ name: 'Ana', description: '' })).toBe('Ana')
    expect(whoPhrase({ name: 'Ana', description: '   ' })).toBe('Ana')
    expect(whoPhrase({ description: '' })).toBe('')
  })
})

describe('sceneWords', () => {
  it('the owner\'s case: every word kept, the tag said once by its card description', () => {
    expect(sceneWords('a macro close up shot of @ana with rain slowly dripping down her hood', { elements: ELS, cards: CARDS }))
      .toBe('a macro close up shot of a cook in a yellow raincoat, hood up with rain slowly dripping down her hood')
  })
  it('a second mention is the name; a prop is said with its article', () => {
    expect(sceneWords('@ana lifts @kettle. @ana smiles.', { elements: ELS, cards: CARDS }))
      .toBe('A cook in a yellow raincoat, hood up lifts the copper kettle. Ana smiles.')
  })
  it('a determiner already there stands and the description loses its own article', () => {
    expect(sceneWords('rain on the @ana', { elements: ELS, cards: CARDS })).toBe('rain on the cook in a yellow raincoat, hood up')
  })
  it('no card: the person is said by name', () => {
    expect(sceneWords('@ana waits.', { elements: ELS })).toBe('Ana waits.')
  })
  it('a cast tag not on the set is dropped (only its mention when a staged person shares the clause)', () => {
    expect(sceneWords('@ben sits by the window. @ana and @ben pour tea, slowly.', { elements: ELS, cards: CARDS, drop: ['ben'], staged: ['ana'] }))
      .toBe('A cook in a yellow raincoat, hood up pours tea, slowly.')
  })
  it('the user\'s own "no people" clause is kept, even with people on the set', () => {
    expect(sceneWords('@ana alone on a quiet street, no other people.', { elements: ELS, cards: CARDS, staged: ['ana'] }))
      .toBe('A cook in a yellow raincoat, hood up alone on a quiet street, no other people.')
  })
  it('the user\'s own label-shaped openers stay (review F1: "Set in", "Cast:", "Lighting:" are the user\'s words now)', () => {
    expect(sceneWords('Set in a small kitchen at dawn. Cast: @ana. Lighting: soft window light.', { elements: ELS }))
      .toBe('Set in a small kitchen at dawn. Cast: Ana. Lighting: soft window light.')
    expect(sceneWords('Set in motion by the storm, @ana runs. Cast: a long shadow on the wall. Materials: tin. Background: hills. Beats: two.', { elements: ELS }))
      .toBe('Set in motion by the storm, Ana runs. Cast: a long shadow on the wall. Materials: tin. Background: hills. Beats: two.')
  })
  it('whitespace is collapsed; nothing reordered', () => {
    expect(sceneWords('  a lamp \n\n on   a stool  ', { elements: ELS })).toBe('a lamp on a stool')
  })
})

describe('dropMentions (moved from stagedPrompt.ts)', () => {
  it('is unchanged: a clause of only gone tags goes, a shared one keeps the staged person', () => {
    expect(dropMentions('@ben sits. A quiet room.', ['ben'], ['ana'])).toBe('A quiet room.')
    expect(dropMentions('@ana walks past @ben.', ['ben'], ['ana'])).toBe('@ana walks past.')
    expect(dropMentions('@ana walks.', [], ['ana'])).toBe('@ana walks.')
  })
  it('F6: a dropped clause that ended the sentence leaves no ";." and the pair\'s verb is said of one', () => {
    expect(dropMentions('@ana and @ben argue by the @kettle; @ben storms out.', ['ben'], ['ana'])).toBe('@ana argues by the @kettle.')
    expect(dropMentions('@ben and @ana both wash up, @ben sings. A quiet room.', ['ben'], ['ana'])).toBe('@ana washes up. A quiet room.')
    expect(dropMentions('@ana and @ben are tired.', ['ben'], ['ana'])).toBe('@ana is tired.')
    expect(dropMentions('@ana and @ben by the door.', ['ben'], ['ana'])).toBe('@ana by the door.')
  })
  it('F6: a list of three keeps its plural; a clause mid-sentence going leaves the comma alone', () => {
    expect(dropMentions('@cy, @ana and @ben argue.', ['ben'], ['ana', 'cy'])).toBe('@cy, @ana argue.')
    expect(dropMentions('@ana waits, @ben sings, the rain falls.', ['ben'], ['ana'])).toBe('@ana waits, the rain falls.')
  })
})

describe('the one tag rule (owner 10-29): each tag once, where typed, by its card', () => {
  const els = [{ tag: 'driver', kind: 'cast' }, { tag: 'car2', kind: 'prop' }, { tag: 'hive', kind: 'prop' }]
  const cards = { driver: 'A race car driver in a red visor. He wears black boots.', car2: 'An open-wheel race car with slick tyres.', hive: 'A white wooden beehive.' }
  it('the first mention is the whole card; a later one is the name; a label with a digit never takes "the"', () => {
    expect(sceneWords('@driver walks to @car2 and leans on @car2.', { elements: els, cards }))
      .toBe('A race car driver in a red visor walks to an open-wheel race car with slick tyres and leans on car2. He wears black boots.')
  })
  it('a determiner before the tag takes the card without its article; mid-sentence the article is lower-cased', () => {
    expect(sceneWords('She opens her @hive slowly.', { elements: els, cards })).toBe('She opens her white wooden beehive slowly.')
    expect(sceneWords('Rain on @hive.', { elements: els, cards })).toBe('Rain on a white wooden beehive.')
  })
  it('a card of several sentences never cuts the user\'s sentence in two; `short` sends only its first sentence', () => {
    const t = '@driver, in a dark suit, stops. Rain falls.'
    expect(sceneWords(t, { elements: els, cards })).toBe('A race car driver in a red visor, in a dark suit, stops. He wears black boots. Rain falls.')
    expect(sceneWords(t, { elements: els, cards, short: true })).toBe('A race car driver in a red visor, in a dark suit, stops. Rain falls.')
  })
})
