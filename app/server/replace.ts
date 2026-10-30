/**
 * Put a finished temp file over its target. Windows refuses the rename (EPERM / EACCES / EBUSY) while another process
 * holds the target open without delete-share — the dev server serving public/ to the browser does, briefly. Retry the
 * rename a few times, then fall back to copying the temp file's bytes over the target in place (not atomic, but the
 * temp file is complete, and a reader only ever sees old or new JSON for files this small) and delete the temp file.
 * Seen live: Use this frame and Place both failed at the last step on locations/manifest.json (2026-10-21).
 */
import { copyFileSync, renameSync, unlinkSync } from 'node:fs'
import { copyFile, rename, unlink } from 'node:fs/promises'

const LOCKED = new Set(['EPERM', 'EACCES', 'EBUSY'])
const TRIES = 5
const isLocked = (e: unknown) => LOCKED.has((e as NodeJS.ErrnoException)?.code ?? '')
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function replaceFile(tmp: string, dest: string): Promise<void> {
  for (let i = 0; i < TRIES; i++) {
    try { await rename(tmp, dest); return } catch (e) { if (!isLocked(e)) throw e }
    await pause(40 * (i + 1))
  }
  await copyFile(tmp, dest)
  await unlink(tmp).catch(() => {})
}

/** the file calls replaceFileSync makes (tests inject a rename that is refused, as Windows does) */
export interface SyncFileOps { rename: (a: string, b: string) => void; copy: (a: string, b: string) => void; unlink: (a: string) => void }
const SYNC_OPS: SyncFileOps = { rename: renameSync, copy: copyFileSync, unlink: unlinkSync }

export function replaceFileSync(tmp: string, dest: string, ops: SyncFileOps = SYNC_OPS): void {
  for (let i = 0; i < TRIES; i++) {
    try { ops.rename(tmp, dest); return } catch (e) { if (!isLocked(e)) throw e }
    const until = Date.now() + 40 * (i + 1)
    while (Date.now() < until) { /* brief spin: sync callers cannot await */ }
  }
  ops.copy(tmp, dest)
  try { ops.unlink(tmp) } catch { /* the target is already written */ }
}
