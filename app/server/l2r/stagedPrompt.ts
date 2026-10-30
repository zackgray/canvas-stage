/**
 * Who the Render prompt names (recipe step 5): the STAGED cast only. A kit take stages the performance's hero (its cast card) and
 * every extra bound to a Bible element (ExtraPlan.tag). Any other cast element in the Bible is not in the clay; naming it grew an
 * unstaged traveller out of the trunk (E137/E138). So a cast @tag nobody stages is dropped from the scene words (its clause, or
 * just its mention when a staged person shares the clause), and only the staged people's cards are described.
 * The prompt then names those people and what they do (stagedWords.ts, prompt.ts); nothing is invented for an extra with no beat.
 * Pure: the caller reads the cards, the Bible and the kit.
 */
import type { BibleRecord } from '../../src/shared/bibleContract.ts'
import type { ExtraPlan } from '../../src/stage3d/contract.ts'
import { stagedPeople } from '../stage3d/stagedPeople.ts'

export interface Staged {
  /** the Bible element it is (absent for a hero whose card no element carries) */
  tag?: string
  description: string
  /** what they do, as a clause that follows the description ("walks slowly towards the camera"); '' = say nothing */
  doing: string
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The hero's action from the take's one-line action, as a clause that follows his description: "the performer stops and looks up",
 * "She lifts a frame…", "Mara lifts…" or "@mara lifts…" (`names` = the hero's own words: tag, card name) -> "stops and looks up" /
 * "lifts a frame…"; a bare verb phrase stays as it is. '' when it names no verb for him: a noun phrase, or any other @tag (that
 * names a scene object, so the action joins the scene words instead).
 */
export function heroDoing(action: string | undefined, names: string[] = []): string {
  const a = (action ?? '').trim().replace(/[.!?]+$/, '')
  if (!a) return ''
  const who = ['(?:the\\s+)?(?:performer|hero|person|character|actor|figure)', 'she', 'he', ...names.filter(Boolean).map((n) => `(?:the\\s+)?@?${esc(n.trim()).replace(/[_-]+/g, '[\\s_-]+')}`)]
  const m = a.match(new RegExp(`^(?:${who.join('|')})\\s+(.+)$`, 'i'))
  const rest = m ? m[1] : /^[a-z]/.test(a) && !/^(a|an|the)\s/i.test(a) ? a : ''
  return /@\w/.test(rest) || !/^[a-z]/i.test(rest) ? '' : rest
}

/** a staged extra does what the brief's beat says, else nothing is said for it (owner 10-29: no invented "walks through the frame") */
const extraDoing = (beat?: string): string => beat ?? ''

/**
 * The staged people, hero first. `descriptions` = Cast card id -> description (castDescriptions). A staged extra whose element is
 * not a cast element is described by its element line; one with no words at all is left out (nothing to name).
 */
export function stagedCast(o: { heroCardId?: string; heroDescription?: string; action?: string; extras?: ExtraPlan[]; bible: BibleRecord | null; descriptions: Record<string, string>
  /** the hero's name words (card name), so "Mara lifts…" is his */ heroNames?: string[]
  /** what a tagged person does from the brief's beats (tag -> clause); the hero's wins over `action` */ beats?: Record<string, string> }): Staged[] {
  const els = o.bible?.elements ?? []
  const out: Staged[] = []
  const heroEl = o.heroCardId ? els.find((e) => e.kind === 'cast' && e.cardId === o.heroCardId) : undefined
  const hd = (o.heroDescription ?? (o.heroCardId ? o.descriptions[o.heroCardId] : '') ?? '').trim()
  if (hd) out.push({ tag: heroEl?.tag, description: hd.replace(/[.!?]+$/, ''), doing: (heroEl && o.beats?.[heroEl.tag]) || heroDoing(o.action, [...(heroEl ? [heroEl.tag] : []), ...(o.heroNames ?? [])]) })
  const seen = new Set<string>(heroEl ? [heroEl.tag] : [])
  // the staged extras by the one definition (stage3d/stagedPeople.ts): tagged, walking or standing
  for (const { extra: x } of stagedPeople({ extras: o.extras }, o.bible).filter((s) => s.extra)) {
    if (!x?.tag || seen.has(x.tag)) continue
    const el = els.find((e) => e.tag === x.tag)
    const d = ((el?.cardId ? o.descriptions[el.cardId] : '') || el?.line || '').trim().replace(/[.!?]+$/, '')
    if (!el || !d) continue
    seen.add(x.tag)
    out.push({ tag: x.tag, description: d, doing: extraDoing(o.beats?.[x.tag]) })
  }
  return out
}

/** the cast @tags of the Bible that nobody on the set stages */
export const unstagedCastTags = (bible: BibleRecord | null, staged: Staged[]): string[] =>
  (bible?.elements ?? []).filter((e) => e.kind === 'cast' && !staged.some((s) => s.tag === e.tag)).map((e) => e.tag)
