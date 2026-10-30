/**
 * Every set key the owner has approved on a world (PLAN-PER-TAKE-SET.md, Approval gate), kept in bible/set-approval.json as `keys`
 * beside the current `key`/`at` (setApproval.ts reads only those two, so the page is unchanged). BibleStore.approveSet appends the
 * key it approves; an approval written before this has no list and counts its `key` only. The still press's gate passes a take that
 * keeps its own set when that set's key is in here: approved once, it stays approved for the takes locked on it, whatever the
 * scene's set is now. Never more than the newest MAX_KEYS. Read-only here.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { biblePaths } from '../../src/shared/bibleContract.ts'
import { SET_APPROVAL_FILE } from './read.ts'

export const MAX_KEYS = 200

const isKey = (k: unknown): k is string => typeof k === 'string' && k.length > 0

/** the approved keys of the world, oldest first (the current `key` last); [] when never approved or the file does not read */
export function approvedSetKeys(publicDir: string, worldId: string): string[] {
  const id = worldId.replace(/^.*\//, '')
  if (!/^[\w-]+$/.test(id)) return []
  try {
    const a = JSON.parse(readFileSync(path.join(publicDir, ...biblePaths(id).root.split('/'), SET_APPROVAL_FILE), 'utf8')) as { key?: unknown; keys?: unknown }
    const list = Array.isArray(a?.keys) ? a.keys.filter(isKey) : []
    return [...new Set([...list, ...(isKey(a?.key) ? [a.key] : [])])]
  } catch { return [] }
}

/** the list an approval of `key` writes: the keys approved before, then `key` (once), the newest MAX_KEYS */
export const keysAfterApproving = (publicDir: string, worldId: string, key: string): string[] =>
  [...approvedSetKeys(publicDir, worldId).filter((k) => k !== key), key].slice(-MAX_KEYS)
