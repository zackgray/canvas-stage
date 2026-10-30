/**
 * Generated set pieces on disk (spec.ts has the layout): which board tiles a world may build (the approved PROP tiles of the scene
 * that owns it, read from that scene's draft design), the runs of each tile, and each tile's status, all read from files and the
 * job records, so a reload or a restarted dev server shows exactly where every press stands. Nothing here spends.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pieceNounOf } from '../../src/stage3d/pieceKinds.ts'
import { isLive, type JobRecord } from '../jobs/index.ts'
import { DraftStore } from '../scene/draft.ts'
import { SceneLibrary } from '../scene/library.ts'
import { LOCATION_RE } from '../location/request.ts'
import {
  FILES, isPieceLabel, labelParts, RUN_RE, runDir, piecesDir, TAG_RE,
  type PieceIntent, type PieceRecord, type PieceTileState,
} from './spec.ts'

export class PieceError extends Error {
  readonly status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

/** an approved prop tile of the owning scene's board, with its look as a file the job can upload */
export interface BuildableTile { tag: string; name: string; kind: string; look: string; file: string }

const readJson = <T>(file: string): T | null => { try { return JSON.parse(readFileSync(file, 'utf8')) as T } catch { return null } }
const LOOK_RE = /^\/lab-assets\/[\w\-./]+\.(png|jpe?g|webp)$/i

export class PieceStore {
  readonly publicDir: string
  private readonly library: SceneLibrary
  private readonly drafts: DraftStore
  constructor(publicDir: string) { this.publicDir = publicDir; this.library = new SceneLibrary(publicDir); this.drafts = new DraftStore(publicDir) }

  world(id: unknown): string {
    if (typeof id !== 'string' || !LOCATION_RE.test(id)) throw new PieceError(400, 'bad world id')
    return id
  }

  /** the look URL as a file under public/, or null when it is not one of ours or is missing */
  lookFile(url: string): string | null {
    if (!LOOK_RE.test(url) || url.split('/').some((p) => p === '..')) return null
    const f = path.join(this.publicDir, ...url.slice(1).split('/'))
    return existsSync(f) ? f : null
  }

  /** the scene that built this world and its approved prop tiles (state approved or yours, with a look) */
  tiles(world: string): { scene: string | null; tiles: BuildableTile[] } {
    const scene = this.library.ownerOf(world)
    if (!scene) return { scene: null, tiles: [] }
    const pieces = (this.drafts.get(scene.id)?.design as { pieces?: unknown } | undefined)?.pieces
    const out: BuildableTile[] = []
    for (const p of Array.isArray(pieces) ? pieces as Record<string, unknown>[] : []) {
      if (p.type !== 'prop' || (p.state !== 'approved' && p.state !== 'yours') || typeof p.tag !== 'string' || !TAG_RE.test(p.tag)) continue
      const looks = Array.isArray(p.looks) ? p.looks : [], look = looks[typeof p.look === 'number' ? p.look : 0] ?? looks[0]
      const name = typeof p.name === 'string' && p.name.trim() ? p.name : p.tag
      const kind = pieceNounOf(name) ?? pieceNounOf(p.tag.replace(/[_-]+/g, ' '))
      const file = typeof look === 'string' ? this.lookFile(look) : null
      if (kind && file && !out.some((t) => t.tag === p.tag)) out.push({ tag: p.tag, name, kind, look: look as string, file })
    }
    return { scene: scene.id, tiles: out }
  }

  runs(world: string, tag: string): string[] {
    const d = path.join(piecesDir(this.publicDir, world), tag)
    try { return readdirSync(d).filter((n) => RUN_RE.test(n)).sort() } catch { return [] }
  }

  dir(world: string, tag: string, run: string) {
    if (!TAG_RE.test(tag) || !RUN_RE.test(run)) throw new PieceError(400, 'bad piece')
    return runDir(this.publicDir, world, tag, run)
  }

  intent(world: string, tag: string, run: string) { return readJson<PieceIntent>(path.join(this.dir(world, tag, run), FILES.intent)) }
  record(world: string, tag: string, run: string) { return readJson<PieceRecord>(path.join(this.dir(world, tag, run), FILES.piece)) }
  hasMesh(world: string, tag: string, run: string) { return existsSync(path.join(this.dir(world, tag, run), FILES.mesh)) }

  async writeIntent(i: PieceIntent): Promise<void> {
    const d = this.dir(i.world, i.tag, i.run)
    await mkdir(d, { recursive: true })
    await writeFile(path.join(d, FILES.intent), JSON.stringify(i, null, 2) + '\n')
  }

  async writeRecord(r: PieceRecord): Promise<void> { await writeFile(path.join(this.dir(r.world, r.tag, r.run), FILES.piece), JSON.stringify(r, null, 2) + '\n') }

  /** the newest placed piece of a tile (a later press that failed leaves the earlier piece placed) */
  placed(world: string, tag: string): PieceRecord | null {
    for (const run of this.runs(world, tag).reverse()) { const r = this.record(world, tag, run); if (r) return r }
    return null
  }

  /**
   * One tile's state from its newest run and that run's job record: piece.json = placed; the mesh landed but the piece is not yet
   * in the plan = landed (a free complete places it); a live record = building; a billed job lost or unfinished = failed with
   * Recover; a job Cloud failed = failed (press again). A tile whose newest run failed still shows its earlier placed piece.
   */
  state(world: string, t: Pick<BuildableTile, 'tag' | 'name' | 'look'>, jobs: JobRecord[], building: string | null): PieceTileState {
    const base = { tag: t.tag, name: t.name, look: t.look }
    const runs = this.runs(world, t.tag), run = runs.at(-1)
    const piece = this.placed(world, t.tag) ?? undefined
    if (!run) return { ...base, status: 'none' }
    if (this.record(world, t.tag, run)) return { ...base, status: 'placed', run, piece }
    if (building === `${t.tag} ${run}`) return { ...base, status: 'building', run, piece }
    if (this.hasMesh(world, t.tag, run)) return { ...base, status: 'landed', run, piece }
    const rec = jobs.filter((r) => isPieceLabel(r.label)).map((r) => ({ r, p: labelParts(r.label) }))
      .filter(({ p }) => p.world === world && p.tag === t.tag && p.run === run).map(({ r }) => r).at(-1)
    if (!rec) return { ...base, status: piece ? 'placed' : 'none', ...(piece ? { run: piece.run, piece } : {}) }
    if ((rec.status === 'waiting' || rec.status === 'submitting') && isLive(rec)) return { ...base, status: 'building', run, piece }
    if (rec.jobId && rec.status !== 'failed') return { ...base, status: 'failed', run, piece, recover: { jobId: rec.jobId }, error: 'This build was paid but its mesh never came back. Recover fetches it by id; nothing is built again.' }
    return { ...base, status: 'failed', run, piece, error: rec.error ? `The build failed: ${rec.error.slice(0, 200)}` : 'The build failed.' }
  }
}
