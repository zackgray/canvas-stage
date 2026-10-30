/**
 * A still's picture URL with its file's version (fix 2026-10-30): `?v=<size>-<mtime>`. The page keeps one decoded image per URL for
 * as long as it is open, so a picture read while it was still being written (or written again under the same name) stayed cut off
 * at its top part until a hard reload. A version that moves with the bytes makes every new or rewritten file a new URL. The server
 * resolves the path without the query (takes/serveShots.ts), so the URL serves exactly what it did.
 */
import { statSync } from 'node:fs'
import path from 'node:path'

/** `url` (a public path like /lab-assets/shots/<take>/hero/<id>.png) with its file's version; unchanged when the file is not there */
export function versionedPng(publicDir: string, url: string): string {
  if (!url || !url.startsWith('/') || url.includes('?')) return url
  try {
    const st = statSync(path.join(publicDir, url))
    return `${url}?v=${st.size}-${Math.round(st.mtimeMs)}`
  } catch { return url }
}

/** each item's `png` versioned */
export const withVersions = <T extends { png: string }>(publicDir: string, items: T[]): T[] =>
  items.map((s) => ({ ...s, png: versionedPng(publicDir, s.png) }))
