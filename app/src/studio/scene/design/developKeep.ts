// Develop again on a scene that already has people or props made on the Stage (joining track, 2026-10-29). A new Develop answer
// replaces the scene words and the Develop brief whole, so a person or prop given a look earlier would drop out of both (its @tag
// gone from the words, so no line for it in the draw or the render, and no element in the sheet's brief). Each approved tile in
// the scene is kept: its @tag goes back where the new words name it (its name, a person's own words: tagWhereNamed, as the Guided
// picks are tagged), else into one "in the scene" line before the story; a Develop element of the same name takes the tile's tag
// (renameTag), so the brief names it once and the sheet's stub for a tag with no element (bibleBrief) covers the rest. Pure.
import type { SceneBriefV2 } from '../../../shared/briefContract'
import { briefTags } from './briefText'
import { renameTag } from './briefV2'
import { tagWhereNamed, type NamedPick } from './guided'
import { done, elementKindOf, type Piece } from './model'

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const andList = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)

/** the tiles made in this scene that are Bible elements (a person, a prop …): approved and in the scene */
export const madeTiles = (pieces: readonly Piece[]): Piece[] => pieces.filter((p) => p.onBoard && done(p) && !!elementKindOf(p.type))

/** the new words and Develop brief with every tile made in the scene kept in them */
export function keepMade(pieces: readonly Piece[], words: string, v2: SceneBriefV2 | undefined): { words: string; v2: SceneBriefV2 | undefined } {
  const made = madeTiles(pieces)
  let v = v2
  for (const p of made) {
    if (!v || v.elements.some((e) => e.tag === p.tag)) continue
    const twin = v.elements.find((e) => same(e.name, p.name))
    if (twin) v = renameTag(v, twin.tag, p.tag)
  }
  const said = briefTags(words)
  const missing = made.filter((p) => !said.includes(p.tag))
  if (!missing.length) return { words, v2: v }
  const picks: NamedPick[] = missing.map((p) => ({ tag: p.tag, type: p.type, name: p.name, ...(p.type === 'person' && p.line.trim() ? { also: [p.line.trim()] } : {}) }))
  const told = tagWhereNamed(words, picks)
  const left = missing.filter((p) => !told.named.has(p.tag))
  if (!left.length) return { words: told.story, v2: v }
  const line = `${andList(left.map((p) => `@${p.tag}`))} ${left.length > 1 ? 'are' : 'is'} in the scene.`
  const lines = told.story.split('\n').filter((l) => l.trim())
  const at = lines.length > 1 ? lines.length - 1 : lines.length
  return { words: [...lines.slice(0, at), line, ...lines.slice(at)].join('\n'), v2: v }
}
