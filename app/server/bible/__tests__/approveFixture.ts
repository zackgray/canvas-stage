// Test fixture: the owner's set approval written straight to disk (what POST /__lab/bible/set/approve leaves), so a paid press in a
// test starts from an approved set. `staleKey` writes an approval at some other key (a piece moved since).
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { biblePaths } from '../../../src/shared/bibleContract.ts'
import { currentSetKey } from '../setGate.ts'
import { SET_APPROVAL_FILE } from '../read.ts'

export function approveSetOnDisk(publicDir: string, worldId: string, staleKey?: string): void {
  const key = staleKey ?? currentSetKey(publicDir, worldId)
  if (!key) throw new Error(`no kit set to approve for ${worldId}`)
  const dir = path.join(publicDir, ...biblePaths(worldId).root.split('/'))
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, SET_APPROVAL_FILE), JSON.stringify({ key, at: '2026-10-25T00:00:00.000Z' }))
}
