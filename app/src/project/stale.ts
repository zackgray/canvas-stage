/**
 * Which of a shot's artefacts no longer match what the shot uses, and why. Pure, shared by browser and server.
 *
 * An artefact is stale when an ingredient version it was made from differs from the version the shot uses now
 * ('latest' resolved to the ingredient's newest), when the shot uses an ingredient it was not made with, or when it
 * was made with one the shot no longer uses. Staleness runs down the pipe: a clip is stale when its still is stale
 * or was re-rendered since (the clip's `from` is not the shot's still), and a finish likewise from its clip.
 * Pinned shots are never stale from an upstream edit: their resolved version does not move.
 */
import { resolveUses, type IngredientKind, type MadeFrom, type PinnedRef, type Project, type Shot } from './model.ts'

export type Stage = 'still' | 'clip' | 'finish'

export interface ShotStaleness {
  stale: boolean
  /** e.g. "look v2 → v3", "cast mara added", "still is stale" */
  reasons: string[]
  /** the artefacts to send back through the pipe, in pipe order */
  what: Stage[]
}

const label = (kind: IngredientKind, id: string, single: boolean) => (single ? kind : `${kind} ${id}`)

function compareOne(kind: IngredientKind, made: PinnedRef | undefined, now: PinnedRef | undefined, single: boolean, out: string[]) {
  if (made && now && made.id === now.id) {
    if (made.version !== now.version) out.push(`${label(kind, now.id, single)} v${made.version} → v${now.version}`)
  } else if (made && now) out.push(`${kind} ${made.id} → ${now.id}`)
  else if (now) out.push(`${label(kind, now.id, false)} added`)
  else if (made) out.push(`${label(kind, made.id, false)} removed`)
}

function compareList(kind: IngredientKind, made: PinnedRef[], now: PinnedRef[], out: string[]) {
  for (const n of now) compareOne(kind, made.find((m) => m.id === n.id), n, false, out)
  for (const m of made) if (!now.some((n) => n.id === m.id)) compareOne(kind, m, undefined, false, out)
}

/** Why an artefact made from `made` does not match `now` (empty: it matches). */
export function ingredientReasons(made: MadeFrom, now: MadeFrom): string[] {
  const out: string[] = []
  compareOne('location', made.location, now.location, true, out)
  compareOne('look', made.look, now.look, true, out)
  compareList('cast', made.cast, now.cast, out)
  compareList('prop', made.props, now.props, out)
  return out
}

export function shotStaleness(p: Project, s: Shot): ShotStaleness {
  const now = resolveUses(p, s.uses)
  const reasons: string[] = []
  const what: Stage[] = []
  const add = (stage: Stage, why: string[]) => {
    if (why.length === 0) return false
    what.push(stage)
    for (const r of why) if (!reasons.includes(r)) reasons.push(r)
    return true
  }
  let upstreamStale = false
  let upstream: { stage: Stage; path: string } | null = null
  for (const stage of ['still', 'clip', 'finish'] as const) {
    const art = s[stage]
    if (!art) continue
    const why = ingredientReasons(art.madeFrom, now)
    if (upstream && upstreamStale) why.push(`${upstream.stage} is stale`)
    else if (upstream && art.from !== undefined && art.from !== upstream.path) why.push(`${upstream.stage} re-rendered`)
    upstreamStale = add(stage, why)
    upstream = { stage, path: art.path }
  }
  return { stale: what.length > 0, reasons, what }
}

/** Every shot's staleness, by shot id. */
export function staleness(p: Project): Record<string, ShotStaleness> {
  const out: Record<string, ShotStaleness> = {}
  for (const s of p.shots) out[s.id] = shotStaleness(p, s)
  return out
}
