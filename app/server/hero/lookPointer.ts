/**
 * The scene's look pointer (draw-from-master plan section 3): `look.json` { takeId, stillId, setAt } in the world's folder, beside
 * bible.json, written by one free button on an approved first frame ("Use this frame as the scene's look"). While it points at a
 * live approved opening the next angle inherits that frame; sameLook.ts falls back to the oldest approved first frame otherwise.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { biblePaths } from '../../src/shared/bibleContract.ts'
import type { TakeRecord } from '../../src/shared/shotContract.ts'
import { STILL_ID_RE, TAKE_ID_RE } from './spec.ts'
import { heroDirOf, HeroHttpError, readJson, stillIdOf, takeIdOf, writeJson } from './store.ts'

export interface LookPointer { takeId: string; stillId: string; setAt: string }
export const LOOK_FILE = 'look.json'

/** the world's folder (a `loc-…` id, bare or as `locations/loc-…`), or null for an id that is not a plain name */
export function worldFolderOf(publicDir: string, worldId: string): string | null {
  const id = worldId.replace(/^.*\//, '')
  return /^[\w-]+$/.test(id) ? path.join(publicDir, ...biblePaths(id).root.split('/')) : null
}

/** the pointer on disk, or null when there is none or it does not read */
export function readLookPointer(publicDir: string, worldId: string): LookPointer | null {
  const dir = worldFolderOf(publicDir, worldId)
  if (!dir) return null
  try {
    const p = JSON.parse(readFileSync(path.join(dir, LOOK_FILE), 'utf8')) as Partial<LookPointer>
    return p && typeof p.takeId === 'string' && TAKE_ID_RE.test(p.takeId) && typeof p.stillId === 'string' && STILL_ID_RE.test(p.stillId)
      ? { takeId: p.takeId, stillId: p.stillId, setAt: typeof p.setAt === 'string' ? p.setAt : '' } : null
  } catch { return null }
}

/** Free. Points the world's look at an approved first frame of `take`; 400 / 404 / 409 before anything is written. */
export async function setLookPointer(publicDir: string, take: Pick<TakeRecord, 'id' | 'worldId' | 'startKey'>, rawStillId: unknown, now = new Date()): Promise<LookPointer> {
  const stillId = stillIdOf(rawStillId)
  const dir = worldFolderOf(publicDir, take.worldId)
  if (!dir) throw new HeroHttpError(400, 'this take has no world to hold a look', 'bad_request')
  const s = await readJson<{ id?: string; takeId?: string; approved?: boolean; role?: string; startKey?: string }>(path.join(heroDirOf(publicDir, take.id), `${stillId}.json`))
  if (!s || s.id !== stillId || s.takeId !== take.id) throw new HeroHttpError(404, 'no such still on this take', 'not_found')
  if (!s.approved || (s.role ?? 'opening') !== 'opening' || s.startKey !== take.startKey) throw new HeroHttpError(409, 'only an approved first frame can be the scene\'s look', 'busy')
  const pointer: LookPointer = { takeId: takeIdOf(take.id), stillId, setAt: now.toISOString() }
  await writeJson(path.join(dir, LOOK_FILE), pointer)
  return pointer
}
