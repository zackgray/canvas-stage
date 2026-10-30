// Guided's words and picks as the v2 scene brief (the stepper writes the structured fields, not label text). Pure.
//   loc text -> place.setting and the logline; cast and props -> elements (their own tiles' tags and words); light text -> light.key;
//   story text -> one beat per sentence, the first cast member's; what Guided wrote is the user's own idea (not `developed`, not
//   `user`, which only a later edit adds). A word stage left to the AI writes nothing. A brief the server's check would refuse
//   (no cast, no story, a logline under 20 characters) is not made: those scenes keep today's flat lines.
import type { BriefElementV2 } from '../../../shared/briefContract'
import type { SceneBriefV2 } from '../../../shared/briefContract'
import { guidedLogline, words, type Guided } from './guided'
import { elementKindOf, type Piece } from './model'
import { savable } from './briefV2'
import { storyBeats } from './storyBeats'

const own = (t: string) => t.trim().replace(/\s+/g, ' ')
const CAST = new Set(['person', 'creature', 'group'])

export function guidedV2(g: Guided, pieces: readonly Piece[], prev?: SceneBriefV2 | null): SceneBriefV2 | null {
  const elements: BriefElementV2[] = pieces.filter((p) => p.onBoard && elementKindOf(p.type)).map((p) => ({
    name: p.name, tag: p.tag, type: p.type as BriefElementV2['type'], look: p.line, supported: true, materials: '', condition: '', face: '',
  }))
  // the beats are a performer's: the first cast member, never a prop; each sentence a verb phrase (storyBeats)
  const hero = elements.find((e) => CAST.has(e.type))
  const beats = storyBeats(own(words(g, 'story')), hero ? [{ tag: hero.tag, name: hero.name }] : [])
  const v: SceneBriefV2 = {
    logline: guidedLogline(g), place: { setting: own(words(g, 'loc')), period: '', season: '', time: '', weather: '' },
    light: { key: own(words(g, 'mood')), direction: '', height: '', quality: '', colour: '', others: '', effect: '' },
    atmosphere: [], elements, beats, camera: prev?.camera ?? { size: '', angle: '', move: '', lensFeel: '' }, style: prev?.style ?? '',
    background: prev?.background ?? '', exclude: prev?.exclude ?? [], warnings: [], developed: [],
  }
  return savable(v) ? v : null
}
