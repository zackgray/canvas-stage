// What a locked take keeps of its own (PLAN-PER-TAKE-PERFORMANCE.md WP4, PLAN-PER-TAKE-SET.md S4), derived from the take record alone:
// the words of the take card and the take list, the "lock again" badge, and the one name every take line uses. Pure; no stores.
import type { TakeRecord } from '../../shared/shotContract'
import { perfMatchesPack, isMocapPackId } from '../../shared/takePerfContract'
import { setMatchesKey } from '../../shared/takeSetContract'
import { displayName } from '../names'

type KeepsIn = Pick<TakeRecord, 'id' | 'packId' | 'perf' | 'set' | 'setKey'> & { name?: string | null }

/** how the take is named on every line: its own name, else how the take list labels it */
export const takeName = (t: { id: string; name?: string | null }): string => t.name || displayName(t.id)

export interface TakeKeeps {
  /** the take holds a walk of its own that is the one it was locked with */
  walk: boolean
  /** the take holds a set of its own that is the one it was locked on */
  set: boolean
  /** no usable walk copy, and the scene's walk is not the take's: the take needs locking again to keep its walk */
  relockWalk: boolean
  /** no usable set copy, and the scene's set is not the take's: the take needs locking again to keep its set */
  relockSet: boolean
}

/** `scene`: the scene's walk (pack id) and set key as they stand; null = not read yet (no badge is shown on a guess) */
export function takeKeeps(t: KeepsIn, scene: { packId: string | null; setKey: string | null } | null): TakeKeeps {
  const walk = perfMatchesPack(t.perf, t.packId)
  const set = setMatchesKey(t.set, t.setKey)
  const relockWalk = !walk && !!scene?.packId && isMocapPackId(t.packId) && scene.packId !== t.packId
  const relockSet = !set && !!scene?.setKey && !!t.setKey && scene.setKey !== t.setKey
  return { walk, set, relockWalk, relockSet }
}

/** "Walk: stands · 6 s · own set": only what is cheap to read off the record; '' when the take keeps neither */
export function keepsSummary(t: Pick<TakeRecord, 'perf'>, k: TakeKeeps): string {
  const parts: string[] = []
  if (k.walk) {
    const secs = t.perf?.shotSeconds
    parts.push(`Walk: ${t.perf?.stand ? 'stands' : 'walks'}${typeof secs === 'number' ? ` · ${Math.round(secs * 10) / 10} s` : ''}`)
  }
  if (k.set) parts.push(k.walk ? 'own set' : 'Own set')
  return parts.join(' · ')
}

/** the badge words, or null when nothing needs locking again */
export function relockWords(k: TakeKeeps): string | null {
  if (!k.relockWalk && !k.relockSet) return null
  return `Lock again to keep its ${k.relockWalk && k.relockSet ? 'walk and set' : k.relockWalk ? 'walk' : 'set'}`
}

/** the one line over the subject panel and the set panel while a take with its own walk and/or set is on show */
export function onShowWords(name: string, walk: boolean, set: boolean): string {
  if (walk && set) return `${name} is on show with its own walk and set. Changes here are for the next take you record; ${name} keeps its walk and set.`
  if (set) return `${name} is on show with its own set. Changes here are for the next take.`
  return `${name} is on show with its own walk. Changes here are for the next take you record; ${name} keeps its walk.`
}
