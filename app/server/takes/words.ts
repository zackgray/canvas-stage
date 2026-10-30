/**
 * A take's own words, name and list row (takeWordsContract.ts). `takeBible` is the one reader the draw, the render and their stale
 * guards use for a take: the world's Bible with the take's words as its prompt, so a still records (and is judged by) the words of
 * ITS take, and a scene prompt edit no longer stales a take that keeps its own. Writes go through the store's temp-then-replace.
 * Free, local, no Comfy.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { type BibleRecord } from '../../src/shared/bibleContract.ts'
import { stillHardWhy } from '../../src/shared/wordsOnFrame.ts'
import { shotPaths, type HeroStill, type TakeRecord } from '../../src/shared/shotContract.ts'
import { sceneMoved, takeBibleOf, takeWords, type TakeBoardRow, type TakeState } from '../../src/shared/takeWordsContract.ts'
import { readBibleFile } from '../bible/read.ts'
import { heroUrl } from '../hero/store.ts'
import { listTakes, readTake, writeJson } from './store.ts'

/** the Bible a take's draw and render read: the world's, with the take's own words as its prompt */
export const takeBible = (publicDir: string, take: TakeRecord): BibleRecord | null => takeBibleOf(readBibleFile(publicDir, take.worldId), take)

function save(publicDir: string, take: TakeRecord): TakeRecord {
  writeJson(path.join(publicDir, shotPaths(take.id).take), take)
  return take
}

/** the take's words now; `rebase` (a Start from… copy) also takes the scene prompt now as its base. Null = no such take */
export function setTakeWords(publicDir: string, id: string, prompt: string, rebase = false): TakeRecord | null {
  const t = readTake(publicDir, id)
  if (!t) return null
  const scene = readBibleFile(publicDir, t.worldId)?.prompt ?? ''
  return save(publicDir, { ...t, prompt, sceneBase: rebase || t.sceneBase === undefined ? scene : t.sceneBase })
}

/** "Update from scene": the scene prompt copied in again (still a copy: a later scene edit says so again) */
export function wordsFromScene(publicDir: string, id: string): TakeRecord | null {
  const t = readTake(publicDir, id)
  if (!t) return null
  const scene = readBibleFile(publicDir, t.worldId)?.prompt ?? ''
  return save(publicDir, { ...t, prompt: scene, sceneBase: scene })
}

/** '' = back to the id's name */
export function renameTake(publicDir: string, id: string, name: string): TakeRecord | null {
  const t = readTake(publicDir, id)
  if (!t) return null
  const { name: _old, ...rest } = t
  return save(publicDir, name ? { ...rest, name } : rest)
}

const readJson =<T>(f: string): T | null => { try { return JSON.parse(readFileSync(f, 'utf8')) as T } catch { return null } }
const files = (dir: string) => { try { return readdirSync(dir) } catch { return [] } }

/** the take's approved first frame, when it still holds (its take's opening, not behind the take's Bible but for its words) */
function approvedOpening(publicDir: string, take: TakeRecord, bible: BibleRecord | null): HeroStill | null {
  const dir = path.join(publicDir, shotPaths(take.id).hero)
  for (const f of files(dir)) {
    if (!/^hero-[\w-]+\.json$/.test(f)) continue
    const s = readJson<HeroStill>(path.join(dir, f))
    if (s?.approved && s.takeId === take.id && (s.role ?? 'opening') === 'opening' && s.startKey === take.startKey && !stillHardWhy(s, bible)) return s
  }
  return null
}

const rendered = (publicDir: string, take: TakeRecord) => {
  const dir = path.join(publicDir, shotPaths(take.id).l2r)
  return files(dir).some((f) => f.endsWith('.json') && readJson<{ status?: string }>(path.join(dir, f))?.status === 'done')
}

/** one row of the take list */
export function boardRow(publicDir: string, take: TakeRecord, scene: BibleRecord | null): TakeBoardRow {
  const still = approvedOpening(publicDir, take, takeBibleOf(scene, take))
  const state: TakeState = rendered(publicDir, take) ? 'rendered' : still ? 'drawn' : 'locked'
  return { id: take.id, name: take.name ?? null, thumb: still ? heroUrl(take.id, `${still.id}.png`) : null, state,
    words: takeWords(take, scene), own: typeof take.prompt === 'string', sceneChanged: sceneMoved(take, scene) }
}

/** the world's take list, newest lock first, and its scene prompt now */
export function takeBoard(publicDir: string, worldId: string): { rows: TakeBoardRow[]; scenePrompt: string } {
  const scene = readBibleFile(publicDir, worldId)
  return { rows: listTakes(publicDir).filter((t) => t.worldId === worldId).map((t) => boardRow(publicDir, t, scene)), scenePrompt: scene?.prompt ?? '' }
}
