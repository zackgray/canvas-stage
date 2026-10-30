/**
 * The one synchronous reader of a world's bible.json for the server's other tracks (hero, l2r, takes). Read-only: the store
 * (store.ts) owns every write. Like the store's get (m6), a lost or torn bible.json falls back to the newest saved version.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { biblePaths, type BibleRecord } from '../../src/shared/bibleContract.ts'
import type { SetApproval } from '../../src/shared/setApproval.ts'

const readRecord = (file: string): BibleRecord | null => {
  try {
    const b = JSON.parse(readFileSync(file, 'utf8')) as BibleRecord
    return b && typeof b.version === 'number' ? b : null
  } catch { return null }
}

/** the world's scene Bible (a `loc-…` id, bare or as `locations/loc-…`), or null when it has none or none reads */
export function readBibleFile(publicDir: string, worldId: string): BibleRecord | null {
  const id = worldId.replace(/^.*\//, '')
  if (!/^[\w-]+$/.test(id)) return null
  const root = path.join(publicDir, ...biblePaths(id).root.split('/'))
  const b = readRecord(path.join(root, 'bible.json'))
  if (b) return b
  let names: string[] = []
  try { names = readdirSync(path.join(root, 'versions')) } catch { return null }
  const versions = names.map((n) => /^v(\d+)\.json$/.exec(n)?.[1]).filter((v): v is string => !!v).map(Number).sort((x, y) => y - x)
  for (const v of versions) { const r = readRecord(path.join(root, 'versions', `v${v}.json`)); if (r) return r }
  return null
}

export const SET_APPROVAL_FILE = 'set-approval.json'
/** the set the owner approved (written by BibleStore.approveSet, beside bible.json), or null when never, or when it does not read */
export function readSetApproval(publicDir: string, worldId: string): SetApproval | null {
  const id = worldId.replace(/^.*\//, '')
  if (!/^[\w-]+$/.test(id)) return null
  try {
    const a = JSON.parse(readFileSync(path.join(publicDir, ...biblePaths(id).root.split('/'), SET_APPROVAL_FILE), 'utf8')) as Partial<SetApproval>
    return a && typeof a.key === 'string' && typeof a.at === 'string' ? { key: a.key, at: a.at } : null
  } catch { return null }
}
