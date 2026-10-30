/**
 * take.json on disk: find, read, list and write a take's record (moved out of store.ts unchanged, which re-exports them). Nothing
 * here reads a kit world, so the kit store can call the take adoption (adopt.ts) before it writes a performance without a cycle.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { replaceFileSync, type SyncFileOps } from '../replace.ts'
import { SHOTS_DIR, shotPaths, type TakeRecord } from '../../src/shared/shotContract.ts'
import { TAKE_ID_RE } from './request.ts'

/** The take's folder (absolute), or null for an id that is not a take id (never a path outside SHOTS_DIR). */
export function takeDir(publicDir: string, id: string): string | null {
  if (!TAKE_ID_RE.test(id)) return null
  const root = path.resolve(publicDir, SHOTS_DIR)
  const dir = path.resolve(publicDir, shotPaths(id).root)
  return dir.startsWith(root + path.sep) ? dir : null
}

export function readTake(publicDir: string, id: string): TakeRecord | null {
  if (!takeDir(publicDir, id)) return null
  try {
    const t = JSON.parse(readFileSync(path.join(publicDir, shotPaths(id).take), 'utf8')) as TakeRecord
    return t && t.id === id ? t : null
  } catch { return null }
}

/** Every take.json under SHOTS_DIR, newest lock first. */
export function listTakes(publicDir: string): TakeRecord[] {
  let names: string[] = []
  try { names = readdirSync(path.join(publicDir, SHOTS_DIR)) } catch { return [] }
  return names.map((n) => readTake(publicDir, n)).filter((t): t is TakeRecord => t !== null)
    .sort((a, b) => b.lockedAt.localeCompare(a.lockedAt) || b.id.localeCompare(a.id))
}

let writes = 0
/** temp file then replace: a temp of its own per write (two writes in flight never share one), and a rename Windows refuses
 *  while a reader holds the file is retried, then copied over (replace.ts); `ops` is for tests */
export function writeJson(file: string, body: unknown, ops?: SyncFileOps) {
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${++writes}.tmp`
  try { writeFileSync(tmp, JSON.stringify(body, null, 1) + '\n'); replaceFileSync(tmp, file, ops) } finally { rmSync(tmp, { force: true }) }
}
