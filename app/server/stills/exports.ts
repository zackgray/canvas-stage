/**
 * Listing the projection lab's exports under public/lab-assets/renders/ and the stills rendered from them.
 *   view-<stamp>/  color.png  mask.png (white = hole)  depth.png  meta.json      (Export view)
 *   clip-<stamp>/  color_000.png  mask_000.png  depth/…  meta.json               (guide clip; first frame used)
 *   <folder>/stills/<id>.png + <id>.json                                         (this lab's results)
 * Pure helpers are exported for tests; `listExports` does the I/O.
 */
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { MANIFEST_URLS } from '../../src/labs/projection/engine/manifestUrls.ts'
import type { ExportEntry, StillRecord } from './types.ts'

export const RENDERS_URL = '/lab-assets/renders'
/** The lab's own manifest list (public-relative), so every shot it can load has its scene prompt found here. */
export const MANIFESTS = MANIFEST_URLS.map((u) => u.replace(/^\//, ''))

const FOLDER_RE = /^(view|clip)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})$/

/** A folder name this lab accepts as input (also the path-safety check for requests). */
export function isExportFolder(name: string): boolean {
  return FOLDER_RE.test(name)
}

/** "2026-10-17T17-17-49" -> ISO string, for sorting and display. */
export function folderTime(name: string): string {
  const m = FOLDER_RE.exec(name)
  if (!m) return ''
  const [d, t] = m[2].split('T')
  return `${d}T${t.replace(/-/g, ':')}Z`
}

/** Which files of an export folder the lab uses, or null if it is not a usable export. */
export type ExportFiles = { kind: 'view' | 'clip'; color: string; mask: string | null; depth: string | null }

/** `files` = the folder's entries; a clip's depth lives in its depth/ subfolder (frame 0 = the colour frame). */
export function exportFiles(name: string, files: string[]): ExportFiles | null {
  const m = FOLDER_RE.exec(name)
  if (!m) return null
  const has = (f: string) => files.includes(f)
  if (m[1] === 'view' && has('color.png')) {
    return { kind: 'view', color: 'color.png', mask: has('mask.png') ? 'mask.png' : null, depth: has('depth.png') ? 'depth.png' : null }
  }
  if (m[1] === 'clip' && has('color_000.png')) {
    return { kind: 'clip', color: 'color_000.png', mask: has('mask_000.png') ? 'mask_000.png' : null, depth: has('depth') ? 'depth/depth_000.png' : null }
  }
  return null
}

type Manifest = { shots?: { id?: string; prompt?: string }[] }

/**
 * The projection lab labels exports "<shot id>#<depth model>", where the id may be prefixed when manifests
 * collide ("e2/wide#moge-2-vitl"). Match the exact id first, then the last path segment.
 */
export function findSourcePrompt(source: string | null | undefined, manifests: Manifest[]): string | null {
  if (!source) return null
  const id = source.split('#')[0]
  const tail = id.split('/').pop() ?? id
  for (const want of [id, tail]) {
    for (const m of manifests) {
      const shot = m.shots?.find((s) => s.id === want && typeof s.prompt === 'string')
      if (shot?.prompt) return shot.prompt
    }
  }
  return null
}

async function readJson<T>(file: string): Promise<T | null> {
  try { return JSON.parse(await readFile(file, 'utf8')) as T } catch { return null }
}

export async function readResults(rendersDir: string, folder: string): Promise<StillRecord[]> {
  const dir = path.join(rendersDir, folder, 'stills')
  if (!existsSync(dir)) return []
  const out: StillRecord[] = []
  for (const f of await readdir(dir)) {
    if (!f.endsWith('.json')) continue
    const r = await readJson<StillRecord>(path.join(dir, f))
    if (r?.id) out.push(r)
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function listExports(publicDir: string): Promise<ExportEntry[]> {
  const rendersDir = path.join(publicDir, 'lab-assets', 'renders')
  if (!existsSync(rendersDir)) return []
  const manifests = (await Promise.all(MANIFESTS.map((m) => readJson<Manifest>(path.join(publicDir, m))))).filter((m): m is Manifest => !!m)
  const entries: ExportEntry[] = []
  for (const d of await readdir(rendersDir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    const files = exportFiles(d.name, await readdir(path.join(rendersDir, d.name)))
    if (!files) continue
    const meta = await readJson<{ source?: string; width?: number; height?: number; holeFraction?: number; holeFractionLastFrame?: number }>(
      path.join(rendersDir, d.name, 'meta.json'))
    const base = `${RENDERS_URL}/${d.name}`
    entries.push({
      folder: d.name,
      kind: files.kind,
      color: `${base}/${files.color}`,
      mask: files.mask ? `${base}/${files.mask}` : null,
      depth: files.depth ? `${base}/${files.depth}` : null,
      width: meta?.width ?? null,
      height: meta?.height ?? null,
      // clips record the hole fraction of their last frame only; the first frame (used here) is the projector view
      holeFraction: files.kind === 'view' ? meta?.holeFraction ?? null : null,
      source: meta?.source ?? null,
      sourcePrompt: findSourcePrompt(meta?.source, manifests),
      createdAt: folderTime(d.name),
      results: await readResults(rendersDir, d.name),
    })
  }
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
