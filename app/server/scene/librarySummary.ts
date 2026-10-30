/**
 * What the library says of a scene, all derived from disk at read time (nothing cached, so it is never out of step): the stage it has
 * reached, a thumbnail, when it was last edited, and the facts the stage screens read (a set already built, the brief changed since).
 *   render: a take of one of its worlds has a finished render    shoot: a take is locked on one of its worlds
 *   set: a world was built                                         board: the draft has tiles on the board    brief: anything else
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { SceneDoc, SceneFacts, SceneStageReached, SceneSummary, SceneView } from '../../src/shared/libraryContract.ts'
import { scenePaths, type DraftDesign, type DraftRecord } from '../../src/shared/sceneContract.ts'
import type { TakeRecord } from '../../src/shared/shotContract.ts'
import { readBibleFile } from '../bible/read.ts'
import { shotDirs } from '../l2r/spec.ts'
import { listTakes } from '../takes/store.ts'

/** the words a set is built from: a change to any of them makes the built set stale (M4) */
export function briefFingerprint(design: DraftDesign | null | undefined): string {
  const d = (design ?? {}) as Record<string, unknown>
  const words = ['brief', 'lighting', 'materials', 'action'].map((k) => (typeof d[k] === 'string' ? (d[k] as string).trim() : ''))
  return createHash('sha1').update(JSON.stringify(words)).digest('hex').slice(0, 16)
}

export function readDraft(publicDir: string, scene: string): DraftRecord | null {
  try { return JSON.parse(readFileSync(path.join(publicDir, ...scenePaths(scene).file.split('/')), 'utf8')) as DraftRecord } catch { return null }
}

type Piece = { onBoard?: boolean; looks?: unknown[]; look?: number }
const boardPieces = (d: DraftDesign | undefined): Piece[] => (Array.isArray(d?.pieces) ? (d!.pieces as Piece[]).filter((p) => p && p.onBoard) : [])

function rendered(publicDir: string, take: TakeRecord): boolean {
  try {
    const dir = shotDirs(publicDir, take.id).l2r
    if (!existsSync(dir)) return false
    return readdirSync(dir).some((f) => {
      if (!f.endsWith('.json')) return false
      try { return (JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as { status?: string }).status === 'done' } catch { return false }
    })
  } catch { return false }
}

function thumbnail(publicDir: string, doc: SceneDoc, pieces: Piece[]): string | null {
  if (doc.worldId) {
    const master = readBibleFile(publicDir, doc.worldId)?.master?.png
    if (master) return master
    if (existsSync(path.join(publicDir, 'lab-assets', 'locations', doc.worldId, 'still.png'))) return `/lab-assets/locations/${doc.worldId}/still.png`
  }
  for (const p of pieces) {
    const url = Array.isArray(p.looks) ? p.looks[p.look ?? 0] ?? p.looks[0] : null
    if (typeof url === 'string' && url.startsWith('/lab-assets/')) return url
  }
  return null
}

/** the scene with its summary and facts; `takes` is every locked take (read once for a whole list) */
export function viewOf(publicDir: string, doc: SceneDoc, takes: TakeRecord[] = listTakes(publicDir)): SceneView {
  const draft = readDraft(publicDir, doc.id)
  const pieces = boardPieces(draft?.design)
  const worlds = new Set(doc.worlds.map((w) => w.id))
  const mine = takes.filter((t) => worlds.has(t.worldId))
  const stage: SceneStageReached = mine.some((t) => rendered(publicDir, t)) ? 'render' : mine.length ? 'shoot' : doc.worlds.length ? 'set'
    : pieces.length ? 'board' : 'brief'
  const lastEdited = [doc.updatedAt, draft?.updatedAt ?? '', ...mine.map((t) => t.lockedAt)].reduce((a, b) => (b > a ? b : a), '')
  const summary: SceneSummary = { id: doc.id, name: doc.name, thumbnail: thumbnail(publicDir, doc, pieces), stage, lastEdited, hidden: doc.hidden, revision: doc.revision }
  const current = doc.worlds.find((w) => w.id === doc.worldId)
  const facts: SceneFacts = {
    setBuilt: doc.worlds.length > 0,
    briefChanged: !!current?.brief && !!draft && briefFingerprint(draft.design) !== current.brief,
    takes: Object.fromEntries(doc.worlds.map((w) => [w.id, mine.filter((t) => t.worldId === w.id).length])),
  }
  return { ...doc, summary, facts }
}
