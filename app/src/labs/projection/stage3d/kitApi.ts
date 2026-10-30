// Kit worlds in the browser: is a manifest shot a kit world, and the fetch layer for /__lab/stage3d (server/stage3d/plugin.ts).
// Nothing here spends.
import type { BankShot } from '../engine/manifest'
import type { GroundKind, PerformancePlan, ScenePlan } from '../../../stage3d/contract'
import type { KitWorld } from '../../../../server/stage3d/types'
export type { KitWorld } from '../../../../server/stage3d/types'
import { gateSetEdit } from './setEditGate'

export const STAGE3D_ROUTE = '/__lab/stage3d'
/** fired on window when a kit world's files change (a saved performance): Shoot re-reads the world */
export const KIT_CHANGED = 'stage3d:changed'

/** A manifest shot that is a kit world (server/stage3d/store.ts kitShot): built in 3D, no still + depth to project. */
export const isKitShot = (shot: BankShot | null | undefined): boolean => (shot as { kind?: unknown } | null | undefined)?.kind === 'kit'

/** the location id of a kit shot (its id, unless the merged list prefixed it) */
export const kitWorldId = (shot: BankShot): string => shot.id.replace(/^.*\//, '')

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

/** a refusal from the server, with parsePlan's own lines when it refused the plan */
export class KitRequestError extends Error {
  readonly errors: string[]
  constructor(message: string, errors: string[] = []) { super(message); this.errors = errors }
}

async function body<T>(res: Response): Promise<T> {
  const b = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as T & { error?: string; errors?: string[] }
  if (!res.ok) throw new KitRequestError(b.error ?? `HTTP ${res.status}`, Array.isArray(b.errors) ? b.errors : [])
  return b
}
const json = (v: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(v) })

export const getKitWorld = async (id: string, f: Fetch = fetch) =>
  body<KitWorld>(await f(`${STAGE3D_ROUTE}/world?id=${encodeURIComponent(id)}`, { cache: 'no-store' }))

export const createKitWorld = async (req: { plan: ScenePlan | unknown; perf?: PerformancePlan; description?: string }, f: Fetch = fetch) =>
  body<KitWorld>(await f(`${STAGE3D_ROUTE}/world`, json(req)))

export const uploadKitStill = async (id: string, png: Blob, f: Fetch = fetch) =>
  body<KitWorld>(await f(`${STAGE3D_ROUTE}/still?id=${encodeURIComponent(id)}`, { method: 'POST', headers: { 'content-type': 'image/png' }, body: png }))

/** the master view's metric depth (16-bit grey PNG), so the Bible master draw can hold to the set */
/** m7 (Wave 2 review): tells useKit to re-read the world, so `masterDepth` is known and the next master draw does not re-render it */
export async function uploadKitMasterDepth(id: string, png: Blob, f: Fetch = fetch): Promise<KitWorld> {
  const w = await body<KitWorld>(await f(`${STAGE3D_ROUTE}/master-depth?id=${encodeURIComponent(id)}`, { method: 'POST', headers: { 'content-type': 'image/png' }, body: png }))
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(KIT_CHANGED, { detail: { id } }))
  return w
}

export async function saveKitPerformance(id: string, perf: PerformancePlan, f: Fetch = fetch): Promise<KitWorld> {
  const w = await body<KitWorld>(await f(`${STAGE3D_ROUTE}/performance?id=${encodeURIComponent(id)}`, json(perf)))
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(KIT_CHANGED, { detail: { id } }))
  return w
}

/**
 * New take (studio/shoot/newTake.ts): the scene's whole set becomes the set of the take on show, sent exactly as the page holds it
 * (the server parses it, adopts the set into the takes still on the scene's set, then writes). Not gated: it is the one set write
 * that makes the scene the take on show's own set, so it runs while that read-only set is on show. Free.
 */
export async function saveKitPlan(id: string, plan: ScenePlan, f: Fetch = fetch): Promise<KitWorld> {
  const w = await body<KitWorld>(await f(`${STAGE3D_ROUTE}/plan?id=${encodeURIComponent(id)}`, json(plan)))
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(KIT_CHANGED, { detail: { id } }))
  return w
}

/** Reset the set (free): every piece and the mark back where Build the set placed them; a set change, so the approval goes stale */
export async function resetKitPlan(id: string, f: Fetch = fetch): Promise<KitWorld> {
  gateSetEdit(id) // a set change: refused while a take with its own other set is on show (setEditGate.ts)
  const w = await body<KitWorld>(await f(`${STAGE3D_ROUTE}/reset?id=${encodeURIComponent(id)}`, json({})))
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(KIT_CHANGED, { detail: { id } }))
  return w
}

/** the sun's direction (free): [yaw, elevation] degrees, the plan's light.keyDir; a set change, so the approval goes stale */
export async function saveKitLight(id: string, keyDir: [number, number], f: Fetch = fetch): Promise<KitWorld> {
  gateSetEdit(id) // a set change: refused while a take with its own other set is on show (setEditGate.ts)
  const w = await body<KitWorld>(await f(`${STAGE3D_ROUTE}/light?id=${encodeURIComponent(id)}`, json({ keyDir })))
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(KIT_CHANGED, { detail: { id } }))
  return w
}

/** the ground's shape (free): plan.ground, flat or rolling; a set change, so the approval goes stale and a locked take reads changed */
export async function saveKitGround(id: string, ground: GroundKind, f: Fetch = fetch): Promise<KitWorld> {
  gateSetEdit(id) // a set change: refused while a take with its own other set is on show (setEditGate.ts)
  const w = await body<KitWorld>(await f(`${STAGE3D_ROUTE}/ground?id=${encodeURIComponent(id)}`, json({ ground })))
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(KIT_CHANGED, { detail: { id } }))
  return w
}

/** the sky's look (free): the plan's sky.look, the field the planner writes; a set change, so the set approval goes stale */
export async function saveKitSkyLook(id: string, look: string, f: Fetch = fetch): Promise<KitWorld> {
  gateSetEdit(id) // a set change: refused while a take with its own other set is on show (setEditGate.ts)
  const w = await body<KitWorld>(await f(`${STAGE3D_ROUTE}/sky?id=${encodeURIComponent(id)}`, json({ look })))
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(KIT_CHANGED, { detail: { id } }))
  return w
}
