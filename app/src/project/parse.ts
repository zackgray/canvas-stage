/**
 * Shape checks for a project document and an "add a version" request, as the dev server receives them. Each throws a
 * ProjectShapeError naming the first bad field; the server answers 400 with its message. Pure, shared with the browser.
 */
import {
  invariantErrors, KEY, KINDS, PROJECT_ID_RE,
  type Artefact, type CardPayload, type Ingredient, type IngredientKind, type LocationPayload, type LookPayload,
  type Payload, type PinnedRef, type Project, type Ref, type Shot, type Uses,
} from './model.ts'

export class ProjectShapeError extends Error {}

type Obj = Record<string, unknown>
const ID_RE = /^[\w.@-]{1,120}$/
const TEXT_MAX = 4000

function fail(where: string, what: string): never {
  throw new ProjectShapeError(`${where}: ${what}`)
}
function obj(v: unknown, where: string): Obj {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(where, 'must be an object')
  return v as Obj
}
function arr(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) fail(where, 'must be an array')
  return v
}
function str(v: unknown, where: string, max = TEXT_MAX): string {
  if (typeof v !== 'string' || v.length > max) fail(where, `must be a string of at most ${max} characters`)
  return v
}
function id(v: unknown, where: string): string {
  if (typeof v !== 'string' || !ID_RE.test(v)) fail(where, 'must be an id (letters, digits, . _ - @)')
  return v
}
function version(v: unknown, where: string): number {
  if (!Number.isInteger(v) || (v as number) < 1) fail(where, 'must be a version number ≥ 1')
  return v as number
}
/** A URL under /lab-assets/ with no '..' segment. */
function assetPath(v: unknown, where: string): string {
  const s = str(v, where, 400)
  if (!s.startsWith('/lab-assets/') || s.split(/[/\\]/).includes('..')) fail(where, 'must be a /lab-assets/ path')
  return s
}
const strings = (v: unknown, where: string, each: (x: unknown, w: string) => string) => arr(v, where).map((x, i) => each(x, `${where}[${i}]`))

export function parsePayload(kind: IngredientKind, v: unknown, where: string): Payload {
  const o = obj(v, where)
  if (kind === 'location') return { shot: id(o.shot, `${where}.shot`), prompt: str(o.prompt, `${where}.prompt`) } satisfies LocationPayload
  if (kind === 'look') {
    if (o.timeOfDay !== null && typeof o.timeOfDay !== 'string') fail(`${where}.timeOfDay`, 'must be a string or null')
    return {
      mood: str(o.mood, `${where}.mood`), timeOfDay: o.timeOfDay as string | null, atmosphere: str(o.atmosphere, `${where}.atmosphere`, 40),
      references: strings(o.references, `${where}.references`, (x, w) => id(x, w)),
    } satisfies LookPayload
  }
  return {
    name: str(o.name, `${where}.name`, 200), description: str(o.description, `${where}.description`),
    references: strings(o.references, `${where}.references`, assetPath), sheets: strings(o.sheets, `${where}.sheets`, assetPath),
  } satisfies CardPayload
}

function parseIngredient(kind: IngredientKind, v: unknown, where: string): Ingredient<Payload> {
  const o = obj(v, where)
  return {
    id: id(o.id, `${where}.id`), name: str(o.name, `${where}.name`, 200),
    versions: arr(o.versions, `${where}.versions`).map((x, i) => {
      const w = `${where}.versions[${i}]`
      const vo = obj(x, w)
      return { version: version(vo.version, `${w}.version`), created: str(vo.created, `${w}.created`, 40), payload: parsePayload(kind, vo.payload, `${w}.payload`) }
    }),
  }
}

function ref(v: unknown, where: string): Ref {
  const o = obj(v, where)
  return { id: id(o.id, `${where}.id`), version: o.version === 'latest' ? 'latest' : version(o.version, `${where}.version`) }
}
function pinned(v: unknown, where: string): PinnedRef {
  const o = obj(v, where)
  return { id: id(o.id, `${where}.id`), version: version(o.version, `${where}.version`) }
}
function uses<R>(v: unknown, where: string, one: (x: unknown, w: string) => R): Uses<R> {
  const o = obj(v, where)
  return {
    location: one(o.location, `${where}.location`), ...(o.look !== undefined ? { look: one(o.look, `${where}.look`) } : {}),
    cast: arr(o.cast, `${where}.cast`).map((x, i) => one(x, `${where}.cast[${i}]`)),
    props: arr(o.props, `${where}.props`).map((x, i) => one(x, `${where}.props[${i}]`)),
  }
}
function artefact(v: unknown, where: string): Artefact | undefined {
  if (v === undefined) return undefined
  const o = obj(v, where)
  return {
    path: assetPath(o.path, `${where}.path`), created: str(o.created, `${where}.created`, 40),
    madeFrom: uses(o.madeFrom, `${where}.madeFrom`, pinned), ...(o.from !== undefined ? { from: assetPath(o.from, `${where}.from`) } : {}),
  }
}

function parseShot(v: unknown, where: string): Shot {
  const o = obj(v, where)
  if (!Number.isFinite(o.order)) fail(`${where}.order`, 'must be a number')
  const s: Shot = { id: id(o.id, `${where}.id`), name: str(o.name, `${where}.name`, 200), order: o.order as number, uses: uses(o.uses, `${where}.uses`, ref) }
  if (o.take !== undefined) s.take = { path: assetPath(obj(o.take, `${where}.take`).path, `${where}.take.path`) }
  for (const a of ['still', 'clip', 'finish'] as const) {
    const art = artefact(o[a], `${where}.${a}`)
    if (art) s[a] = art
  }
  return s
}

/** A whole project document: shape first, then the model's invariants (versions 1..n, refs resolve). */
export function parseProject(v: unknown): Project {
  const o = obj(v, 'project')
  if (typeof o.id !== 'string' || !PROJECT_ID_RE.test(o.id)) fail('project.id', 'must be a project id')
  if (!Number.isInteger(o.revision) || (o.revision as number) < 0) fail('project.revision', 'must be an integer ≥ 0')
  const ing = obj(o.ingredients, 'project.ingredients')
  const ingredients = Object.fromEntries(KINDS.map((k) =>
    [KEY[k], arr(ing[KEY[k]], `ingredients.${KEY[k]}`).map((x, i) => parseIngredient(k, x, `ingredients.${KEY[k]}[${i}]`))])) as unknown as Project['ingredients']
  const p: Project = {
    id: o.id, name: str(o.name, 'project.name', 200), created: str(o.created, 'project.created', 40), revision: o.revision as number,
    ingredients, shots: arr(o.shots, 'project.shots').map((x, i) => parseShot(x, `shots[${i}]`)),
  }
  const errors = invariantErrors(p)
  if (errors.length) throw new ProjectShapeError(errors.slice(0, 5).join('; '))
  return p
}

export interface AddVersionRequest {
  kind: IngredientKind
  id: string
  payload: Payload
  /** the ingredient's display name (kept when absent) */
  name?: string
  /** when given, the project's revision must still be this one (409 otherwise) */
  revision?: number
}

export function parseAddVersion(v: unknown): AddVersionRequest {
  const o = obj(v, 'request')
  if (!KINDS.includes(o.kind as IngredientKind)) fail('kind', `must be one of ${KINDS.join(', ')}`)
  const kind = o.kind as IngredientKind
  const r: AddVersionRequest = { kind, id: id(o.id, 'id'), payload: parsePayload(kind, o.payload, 'payload') }
  if (o.name !== undefined) r.name = str(o.name, 'name', 200)
  if (o.revision !== undefined) {
    if (!Number.isInteger(o.revision)) fail('revision', 'must be an integer')
    r.revision = o.revision as number
  }
  return r
}
