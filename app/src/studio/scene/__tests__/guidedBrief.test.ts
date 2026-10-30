// The guided brief's composition: place, light and mood on their own lines, then who and what is in the scene, then the story —
// each picked cast card and prop tile tagged at EVERY mention (a cast card's role words name it too), else a clear "in the
// scene" sentence right before the story. Hand-typed @tags are left alone. Pure.
import { describe, expect, it } from 'vitest'
import { castCard, freshGuided, guidedLogline, liveBrief, propCard, tagWhereNamed, type LiveRun } from '../design/guided'

const textOf = (runs: LiveRun[]) => runs.map((r) => ('tag' in r ? `@${r.tag}` : r.text)).join('')
const picked = (g: ReturnType<typeof freshGuided>) => {
  for (const c of g.cast) { c.cands = ['/l.png']; c.pick = 0 }
  for (const p of g.props ?? []) { p.cands = ['/p.png']; p.pick = 0 }
}

describe('tagWhereNamed', () => {
  const picks = [{ tag: 'ladder', type: 'prop' as const, name: 'Ladder' }, { tag: 'basket', type: 'prop' as const, name: 'Basket' }]
  it('tags EVERY mention, plural included, and takes its article with it', () => {
    const out = tagWhereNamed('She lifts a ladder down, leans it on the tree, and the ladders creak.', picks.slice(0, 1))
    expect(out.story).toBe('She lifts @ladder down, leans it on the tree, and @ladder creak.')
    expect([...out.named]).toEqual(['ladder'])
  })
  it('a multi-word name falls back to its last word; a mention already behind an @tag is left alone', () => {
    const out = tagWhereNamed('A keeper, @nadia, carries her baskets at dusk.', [{ tag: 'nadia', type: 'person' as const, name: 'Nadia' }, ...picks])
    expect(out.story).toBe('A keeper, @nadia, carries her @basket at dusk.')
    expect([...out.named].sort()).toEqual(['basket', 'nadia'])
  })
  it('a pick the story does not name is not written', () => {
    const out = tagWhereNamed('She rests in the shade.', picks)
    expect(out.story).toBe('She rests in the shade.')
    expect(out.named.size).toBe(0)
  })
  it('a short word never matches on its own', () => {
    const out = tagWhereNamed('A cart at a fork.', [{ tag: 'ox', type: 'creature' as const, name: 'Ox' }])
    expect(out.story).toBe('A cart at a fork.')
  })
  it('a cast card\'s role word names the person: "an orchard keeper" tending becomes her tag', () => {
    const out = tagWhereNamed('An orchard keeper climbs at dawn.', [{ tag: 'nadia', type: 'person' as const, name: 'Nadia', also: ['an orchard keeper'] }])
    expect(out.story).toBe('@nadia climbs at dawn.')
    expect([...out.named]).toEqual(['nadia'])
  })
  it('a long role line never tags an unrelated word: only its whole phrase or a lone role noun matches', () => {
    const out = tagWhereNamed('The orchard is quiet at first light.', [{ tag: 'nadia', type: 'person' as const, name: 'Nadia', also: ['an orchard keeper'] }])
    expect(out.story).toBe('The orchard is quiet at first light.')
    expect(out.named.size).toBe(0)
  })
})

describe('the composed guided brief', () => {
  const scene = (story: string) => {
    const g = freshGuided([castCard('Nadia', 'person', 'an orchard keeper', { tag: 'nadia', look: '/l.png' })])
    g.props = [propCard('Ladder', 'a wooden ladder'), propCard('Basket', 'a wicker basket')]
    picked(g)
    g.st.loc.text = 'An orchard at golden hour'
    g.st.mood.text = 'Warm low sun'
    g.st.story.text = story
    return g
  }

  it('reads as a brief: one line per part, the untagged picks in an "in the scene" sentence right before the story', () => {
    const g = scene('She opens the barn, sets a ladder against the tree and climbs.')
    expect(guidedLogline(g)).toBe('An orchard at golden hour.\nWarm low sun.\n@nadia and @basket are in the scene.\nShe opens the barn, sets @ladder against the tree and climbs.')
    const runs = liveBrief(g)
    expect(textOf(runs)).toContain('She opens the barn, sets @ladder against the tree')
    expect(runs.some((r) => 'tag' in r && r.tag === 'ladder' && r.type === 'prop')).toBe(true)
    expect(runs.some((r) => 'tag' in r && r.tag === 'nadia' && r.type === 'person')).toBe(true)
  })

  it('breaks a line between each of the four parts', () => {
    const lines = guidedLogline(scene('She opens the barn.')).split('\n')
    expect(lines).toEqual(['An orchard at golden hour.', 'Warm low sun.', '@nadia, @ladder and @basket are in the scene.', 'She opens the barn.'])
  })

  it('tags the person on the role word the card uses: no separate sentence, the story names her', () => {
    const g = scene('An orchard keeper picks apples at dusk.')
    expect(guidedLogline(g)).toBe('An orchard at golden hour.\nWarm low sun.\n@ladder and @basket are in the scene.\n@nadia picks apples at dusk.')
    expect(guidedLogline(g)).not.toContain('@nadia is in the scene')
  })

  it('tags the cast on their name too: only the props keep their "in the scene" sentence', () => {
    const g = scene('Nadia opens the barn and smiles.')
    expect(guidedLogline(g)).toBe('An orchard at golden hour.\nWarm low sun.\n@ladder and @basket are in the scene.\n@nadia opens the barn and smiles.')
    expect(guidedLogline(g)).not.toContain('@nadia is in the scene')
  })

  it('the fallback sentence sits right before the story, not before the light line', () => {
    const lines = guidedLogline(scene('She opens the barn and smiles.')).split('\n')
    expect(lines[1]).toBe('Warm low sun.')
    expect(lines.at(-2)).toBe('@nadia, @ladder and @basket are in the scene.')
    expect(lines.at(-1)).toBe('She opens the barn and smiles.')
  })

  it('names nothing: every pick gets the "in the scene" sentence, then the story', () => {
    const g = scene('The afternoon is long and quiet.')
    expect(guidedLogline(g)).toBe('An orchard at golden hour.\nWarm low sun.\n@nadia, @ladder and @basket are in the scene.\nThe afternoon is long and quiet.')
  })

  it('a story already hand-tagged is left exactly as written', () => {
    const g = scene('A keeper, @nadia, leans her @ladder at dusk.')
    expect(guidedLogline(g)).toBe('An orchard at golden hour.\nWarm low sun.\n@basket is in the scene.\nA keeper, @nadia, leans her @ladder at dusk.')
  })

  it('tags every mention of a prop, not only the first', () => {
    const g = scene('She takes the ladder down, and the ladder creaks under her boots.')
    expect(guidedLogline(g)).toContain('@nadia and @basket are in the scene.')
    expect(guidedLogline(g)).toContain('She takes @ladder down, and @ladder creaks under her boots.')
    expect(guidedLogline(g).match(/@ladder/g)?.length).toBe(2)
  })

  it('an empty stage writes nothing: the picks still get their "in the scene" sentence', () => {
    const g = scene('')
    const runs = liveBrief(g)
    expect(textOf(runs)).toContain('@nadia, @ladder and @basket are in the scene.')
    expect(textOf(runs)).not.toContain('the AI decides')
  })
})
