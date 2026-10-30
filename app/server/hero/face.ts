/**
 * Who is in the hero still and which image is their face: the perform session lifted into the take's pack (server/realism/cast.ts
 * findSession), its place.json cast in Place order, the first card with a face image (references[1], else sheets[4]).
 * Also the world's own words (the location's meta.json). Read-only. Refuses with a plain message when no card resolves.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { TakeRecord } from '../../src/shared/shotContract.ts'
import { ProjectStore } from '../project/store.ts'
import { CastError, findSession, lightingOf, performDir } from '../realism/cast.ts'
import { castFace, NO_KIT_CAST } from './castCard.ts'
import { HeroHttpError } from './store.ts'

export interface HeroWho { sid: string; name: string; description: string; faceFile: string; lighting: string | undefined; world: string }

const readJson = <T>(f: string): T | null => { try { return JSON.parse(readFileSync(f, 'utf8')) as T } catch { return null } }

/** A /lab-assets/… URL as a file under publicDir/lab-assets, or null when it climbs out or is not on disk. */
export function assetFile(publicDir: string, url: string | undefined): string | null {
  if (typeof url !== 'string' || !url.startsWith('/lab-assets/')) return null
  const root = path.resolve(publicDir, 'lab-assets')
  const file = path.resolve(publicDir, url.slice(1).split('?')[0])
  return file.startsWith(root + path.sep) && existsSync(file) ? file : null
}

/** The world's scene words (the location's own prompt or description), '' when it has none. */
export function worldWords(publicDir: string, worldId: string): string {
  if (!/^[\w-]+$/.test(worldId)) return ''
  const m = readJson<{ result?: { shot?: { prompt?: string; description?: string } }; prompt?: string; description?: string }>(path.join(publicDir, 'lab-assets', 'locations', worldId, 'meta.json'))
  const s = m?.result?.shot
  return (s?.description || s?.prompt || m?.description || m?.prompt || '').trim()
}

/**
 * The face for a take: the perform session first (the panorama path, unchanged). A take on a kit world (`kit` given) whose
 * performer has no perform session - a mocap performer never has one - takes the cast card its performance names (castCard.ts),
 * else the project's first; with no cast card at all it is refused, 409 no_cast, in plain words. No face is ever invented.
 */
export async function resolveWho(publicDir: string, take: Pick<TakeRecord, 'packId' | 'worldId'>, sid?: string, kit?: { castId?: string } | null): Promise<HeroWho> {
  if (!kit) return sessionWho(publicDir, take, sid)
  // a kit world's performer is played by the card Perform saved; with none named there is no one to pay for (never a guess)
  if (!kit.castId) throw new HeroHttpError(409, NO_KIT_CAST, 'no_cast')
  try { return await sessionWho(publicDir, take, sid) } catch (e) {
    if (!(e instanceof HeroHttpError) || e.code !== 'no_cast') throw e
  }
  const c = await castFace(publicDir, kit.castId)
  if (!c) {
    throw new HeroHttpError(409, `No face for the 3D performer: the cast card "${kit.castId}" picked to play them is not in the project or has no face image. Pick another in The subject's panel on the Stage, or give this one a face image there.`, 'no_cast')
  }
  return { sid: `cast:${c.cardId}`, name: c.name, description: c.description, faceFile: c.faceFile, lighting: undefined, world: worldWords(publicDir, take.worldId) }
}

async function sessionWho(publicDir: string, take: Pick<TakeRecord, 'packId' | 'worldId'>, sid?: string): Promise<HeroWho> {
  const refuse = (msg: string) => new HeroHttpError(400, `No cast face card for this take: ${msg}`, 'no_cast')
  let id: string
  try { id = findSession(publicDir, take.packId, sid) } catch (e) { throw e instanceof CastError ? refuse(e.message) : e }
  const place = readJson<{ cast?: { cardId: string; version: number }[]; locationId?: string | null }>(path.join(performDir(publicDir), id, 'place', 'place.json'))
  if (!place?.cast?.length) throw refuse(`session ${id} has no cast in place.json`)
  const store = new ProjectStore(publicDir)
  const projects = [] as Awaited<ReturnType<ProjectStore['read']>>[]
  for (const p of await store.list()) projects.push(await store.read(p.id).catch(() => null))
  let seen = 0
  for (const c of place.cast) {
    for (const p of projects) {
      const v = p?.ingredients.cast.find((i) => i.id === c.cardId)?.versions.find((x) => x.version === c.version)
      if (!v) continue
      seen++
      const face = assetFile(publicDir, v.payload.references[1] ?? v.payload.sheets[4])
      if (face) return { sid: id, name: v.payload.name, description: v.payload.description, faceFile: face, lighting: lightingOf(publicDir, place.locationId ?? null), world: worldWords(publicDir, take.worldId) }
    }
  }
  throw refuse(seen ? 'the cast cards have no face image yet (a card needs its reference or sheet images)' : 'the cast cards are not in any project')
}
