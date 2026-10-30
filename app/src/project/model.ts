/**
 * The project model (t24): versioned ingredients, and shots that reference ingredient versions. Shared by the browser
 * (useProject.ts) and the dev server (server/project/**), so it is pure and imports nothing but its siblings.
 *
 * Stored as public/lab-assets/projects/<id>/project.json (gitignored), one whole document per project, saved with an
 * optimistic `revision` (server/project/store.ts). Paths are URLs under /lab-assets/ as the other records write them.
 *
 * Version policy: a shot follows an ingredient's latest version unless it pins one. `version: 'latest'` follows,
 * a number pins. Every artefact (still, clip, finish) records the exact versions it was made from, so editing an
 * ingredient marks every following shot stale (stale.ts) and leaves pinned shots alone.
 */

export type IngredientKind = 'location' | 'look' | 'cast' | 'prop'
export const KINDS: IngredientKind[] = ['location', 'look', 'cast', 'prop']

/** A location: one shot of the locations manifest (locations/manifest.json) and the prompt it was made from. */
export interface LocationPayload {
  shot: string
  prompt: string
}

/** A look: the Look section's settings (looks/<key>/look.json) and its reference images' file names (ref-1.jpg …). */
export interface LookPayload {
  mood: string
  timeOfDay: string | null
  atmosphere: string
  references: string[]
}

/** A cast member or a prop: a card. Reference and sheet images are URLs under /lab-assets/ (none yet). */
export interface CardPayload {
  name: string
  description: string
  references: string[]
  sheets: string[]
}

export interface PayloadOf {
  location: LocationPayload
  look: LookPayload
  cast: CardPayload
  prop: CardPayload
}
export type Payload = PayloadOf[IngredientKind]

export interface IngredientVersion<P> {
  /** 1, 2, 3 … in list order, never reused */
  version: number
  created: string
  payload: P
}

export interface Ingredient<P> {
  id: string
  name: string
  versions: IngredientVersion<P>[]
}

export interface Ingredients {
  locations: Ingredient<LocationPayload>[]
  looks: Ingredient<LookPayload>[]
  cast: Ingredient<CardPayload>[]
  props: Ingredient<CardPayload>[]
}

export const KEY: Record<IngredientKind, keyof Ingredients> = { location: 'locations', look: 'looks', cast: 'cast', prop: 'props' }

/** What a shot uses: a number pins that version, 'latest' follows the newest. */
export interface Ref {
  id: string
  version: number | 'latest'
}

/** An exact version, as an artefact records what it was made from. */
export interface PinnedRef {
  id: string
  version: number
}

export interface Uses<R = Ref> {
  location: R
  look?: R
  cast: R[]
  props: R[]
}
export type MadeFrom = Uses<PinnedRef>

/** A rendered result of a shot and the ingredient versions it was made from. */
export interface Artefact {
  /** URL of the file, e.g. /lab-assets/renders/view-…/stills/render-….png */
  path: string
  created: string
  madeFrom: MadeFrom
  /** URL of the upstream artefact it was made from (a clip: its first-frame still; a finish: its clip) */
  from?: string
}

export interface Shot {
  id: string
  name: string
  order: number
  uses: Uses
  /** the recorded camera take: its clip folder under /lab-assets/renders/ (cameras.json + guide depth) */
  take?: { path: string }
  still?: Artefact
  clip?: Artefact
  finish?: Artefact
}

export interface Project {
  id: string
  name: string
  created: string
  /** bumped by the server on every save; a save carrying an older one is refused (409) */
  revision: number
  ingredients: Ingredients
  shots: Shot[]
}

export const PROJECT_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i
/** The project the app opens, bootstrapped from today's files on first use (server/project/bootstrap.ts). */
export const DEFAULT_PROJECT = 'default'

export function ingredient(p: Project, kind: IngredientKind, id: string): Ingredient<Payload> | undefined {
  return (p.ingredients[KEY[kind]] as Ingredient<Payload>[]).find((i) => i.id === id)
}

export const latestVersion = (i: Ingredient<unknown>) => i.versions.at(-1)?.version ?? 0

/** The exact version a ref means now (0 when the ingredient is unknown). */
export function resolveRef(p: Project, kind: IngredientKind, r: Ref): number {
  const ing = ingredient(p, kind, r.id)
  if (!ing) return 0
  return r.version === 'latest' ? latestVersion(ing) : r.version
}

/** A shot's uses with every 'latest' resolved: what a render made now would record as madeFrom. */
export function resolveUses(p: Project, u: Uses): MadeFrom {
  const pin = (kind: IngredientKind, r: Ref): PinnedRef => ({ id: r.id, version: resolveRef(p, kind, r) })
  return {
    location: pin('location', u.location), ...(u.look ? { look: pin('look', u.look) } : {}),
    cast: u.cast.map((r) => pin('cast', r)), props: u.props.map((r) => pin('prop', r)),
  }
}

/** A copy of `p` with a new version of ingredient `id` appended (the ingredient is created at v1 when new). */
export function addVersion<K extends IngredientKind>(p: Project, kind: K, id: string, payload: PayloadOf[K], created: string, name?: string): Project {
  const list = p.ingredients[KEY[kind]] as Ingredient<PayloadOf[K]>[]
  const old = list.find((i) => i.id === id)
  const next: Ingredient<PayloadOf[K]> = old
    ? { ...old, name: name ?? old.name, versions: [...old.versions, { version: latestVersion(old) + 1, created, payload }] }
    : { id, name: name ?? id, versions: [{ version: 1, created, payload }] }
  const nextList = old ? list.map((i) => (i === old ? next : i)) : [...list, next]
  return { ...p, ingredients: { ...p.ingredients, [KEY[kind]]: nextList } }
}

/** Every broken invariant of a project, as readable lines (empty = sound). */
export function invariantErrors(p: Project): string[] {
  const errors: string[] = []
  for (const kind of KINDS) {
    const seen = new Set<string>()
    for (const ing of p.ingredients[KEY[kind]] as Ingredient<unknown>[]) {
      if (seen.has(ing.id)) errors.push(`${kind} ${ing.id}: duplicate id`)
      seen.add(ing.id)
      if (ing.versions.length === 0) errors.push(`${kind} ${ing.id}: no versions`)
      ing.versions.forEach((v, i) => {
        if (v.version !== i + 1) errors.push(`${kind} ${ing.id}: versions must run 1, 2, 3 … (found v${v.version} at ${i + 1})`)
      })
    }
  }
  const ids = new Set<string>()
  for (const s of p.shots) {
    if (ids.has(s.id)) errors.push(`shot ${s.id}: duplicate id`)
    ids.add(s.id)
    const check = (where: string, kind: IngredientKind, r: Ref) => {
      const ing = ingredient(p, kind, r.id)
      if (!ing) errors.push(`shot ${s.id} ${where}: no ${kind} ${r.id}`)
      else if (r.version !== 'latest' && !ing.versions.some((v) => v.version === r.version)) errors.push(`shot ${s.id} ${where}: ${kind} ${r.id} has no v${r.version}`)
    }
    const checkUses = (where: string, u: Uses) => {
      check(where, 'location', u.location)
      if (u.look) check(where, 'look', u.look)
      u.cast.forEach((r) => check(where, 'cast', r))
      u.props.forEach((r) => check(where, 'prop', r))
    }
    checkUses('uses', s.uses)
    for (const a of ['still', 'clip', 'finish'] as const) {
      const art = s[a]
      if (art) checkUses(`${a} made from`, art.madeFrom)
    }
  }
  return errors
}

/** A copy of `p` with `shot` replacing the shot of the same id, or appended. */
export function upsertShot(p: Project, shot: Shot): Project {
  const has = p.shots.some((s) => s.id === shot.id)
  return { ...p, shots: has ? p.shots.map((s) => (s.id === shot.id ? shot : s)) : [...p.shots, shot] }
}

export function emptyProject(id: string, name: string, created: string): Project {
  return { id, name, created, revision: 0, ingredients: { locations: [], looks: [], cast: [], props: [] }, shots: [] }
}
