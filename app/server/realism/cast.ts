/**
 * Who is in the shot, for the Realism prompt: the perform session behind a warp folder (the request's `sid`, else the
 * session whose lift.json.packId equals cameras.json.packId), its place.json cast in Place order, each card's name and
 * description from the project document, and the location's lighting line when its meta.json carries one. Read-only.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { OutfitCard } from '../prompt/outfit.ts'
import { ProjectStore } from '../project/store.ts'

export class CastError extends Error { readonly status: number; constructor(status: number, message: string) { super(message); this.status = status } }

const readJson = <T>(f: string): T | null => { try { return JSON.parse(readFileSync(f, 'utf8')) as T } catch { return null } }
const SID_RE = /^perf-[\w-]{1,64}$/

export const performDir = (publicDir: string) => path.join(publicDir, 'lab-assets', 'perform')

export function findSession(publicDir: string, packId: string | null, sid?: string): string {
  const root = performDir(publicDir)
  if (sid !== undefined) {
    if (!SID_RE.test(sid) || !existsSync(path.join(root, sid))) throw new CastError(404, `no perform session ${sid}`)
    return sid
  }
  const hit = existsSync(root) ? readdirSync(root).filter((s) => SID_RE.test(s)).find((s) => packId && readJson<{ packId?: string }>(path.join(root, s, 'lift', 'lift.json'))?.packId === packId) : undefined
  if (!hit) throw new CastError(400, `cast cannot be resolved: no perform session was lifted into ${packId ?? 'this render'}; pass its sid`)
  return hit
}

export interface RealismCast { sid: string; cast: OutfitCard[]; lighting: string | undefined }

export async function resolveCast(publicDir: string, packId: string | null, sid?: string): Promise<RealismCast> {
  const id = findSession(publicDir, packId, sid)
  const dir = path.join(performDir(publicDir), id, 'place')
  const place = readJson<{ cast?: { cardId: string; version: number }[]; locationId?: string | null }>(path.join(dir, 'place.json'))
  if (!place?.cast?.length) throw new CastError(400, `cast cannot be resolved: session ${id} has no cast in place.json`)
  const store = new ProjectStore(publicDir)
  const projects = [] as Awaited<ReturnType<ProjectStore['read']>>[]
  for (const p of await store.list()) projects.push(await store.read(p.id).catch(() => null))
  const cards = place.cast.map((c) => {
    for (const p of projects) {
      const v = p?.ingredients.cast.find((i) => i.id === c.cardId)?.versions.find((x) => x.version === c.version)
      if (v) return { name: v.payload.name, description: v.payload.description }
    }
    throw new CastError(400, `cast cannot be resolved: card ${c.cardId} v${c.version} is not in any project`)
  })
  return { sid: id, cast: cards, lighting: lightingOf(publicDir, place.locationId ?? null) }
}

/** `lighting` on the location's meta.json (top level, or under `surround`); absent = no light line. */
export function lightingOf(publicDir: string, locationId: string | null): string | undefined {
  if (!locationId || !/^[\w-]+$/.test(locationId)) return undefined
  const m = readJson<{ lighting?: unknown; surround?: { lighting?: unknown } }>(path.join(publicDir, 'lab-assets', 'locations', locationId, 'meta.json'))
  const l = m?.lighting ?? m?.surround?.lighting
  return typeof l === 'string' && l.trim() ? l.trim() : undefined
}
