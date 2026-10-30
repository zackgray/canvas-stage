/**
 * Scene's draft design, kept per project before any world exists (sceneContract.ts): the design JSON written as you go, the images
 * uploaded or dropped into it (real files with size and type limits), and the move into the world's Bible at Build the set, where
 * every file the design points at under the project's scene folder is copied into the Bible's elements/ and the design's URLs are
 * rewritten to the copies. Free; no Comfy. Files: public/lab-assets/scene/<project>/draft/{design.json, refs/…}.
 */
import { existsSync, readFileSync } from 'node:fs'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PROJECT_ID_RE } from '../../src/project/model.ts'
import { biblePaths } from '../../src/shared/bibleContract.ts'
import {
  DRAFT_LIMIT, scenePaths, UPLOAD_LIMIT, UPLOAD_TYPES,
  type DraftDesign, type DraftMigrateResponse, type DraftRecord, type UploadExt, type UploadResponse,
} from '../../src/shared/sceneContract.ts'
import { LOCATION_RE } from '../location/request.ts'
import { replaceFile } from '../replace.ts'

export class DraftError extends Error {
  readonly status: number
  /** on a 409: the revision the draft is at */
  readonly revision?: number
  constructor(status: number, message: string, revision?: number) { super(message); this.status = status; this.revision = revision }
}

/** what a stale write is told (m7: two tabs on one scene never overwrite each other silently) */
export const STALE_DRAFT = 'This scene was changed in another tab or window, so this change was not saved. Reload to see the newest version.'

/** png / jpeg / webp by their first bytes (the name and the header are not trusted) */
export function sniff(b: Buffer): UploadExt | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp'
  return null
}

export class DraftStore {
  readonly publicDir: string
  private readonly now: () => Date
  private readonly rand: () => string
  private saves = 0
  private queues = new Map<string, Promise<unknown>>()
  constructor(publicDir: string, now: () => Date = () => new Date(), rand = () => Math.random().toString(36).slice(2, 8).padEnd(6, '0')) {
    this.publicDir = publicDir; this.now = now; this.rand = rand
  }

  private abs(rel: string) { return path.join(this.publicDir, ...rel.split('/')) }
  private project(p: unknown): string {
    if (typeof p !== 'string' || !PROJECT_ID_RE.test(p)) throw new DraftError(400, 'bad project id')
    return p
  }

  get(project: unknown): DraftRecord | null {
    const file = this.abs(scenePaths(this.project(project)).file)
    if (!existsSync(file)) return null
    try { return JSON.parse(readFileSync(file, 'utf8')) as DraftRecord } catch { return null }
  }

  /** the stored draft's revision (0 = none yet; a draft written before revisions counts as 0) */
  revisionOf(project: string): number { return this.get(project)?.revision ?? 0 }

  /** runs `fn` after every earlier write to the same draft has settled, so the revision check and the write cannot interleave */
  private serial<T>(p: string, fn: () => Promise<T>): Promise<T> {
    const run = (this.queues.get(p) ?? Promise.resolve()).catch(() => {}).then(fn)
    this.queues.set(p, run)
    return run
  }

  /**
   * Replaces the draft. `revision` must be the one the page read (0 for a scene with no draft yet), else 409 with the stored one
   * and nothing is written (m7); the saved record carries revision + 1.
   */
  async save(project: unknown, design: unknown, revision?: unknown): Promise<DraftRecord> {
    const p = this.project(project)
    if (!design || typeof design !== 'object' || Array.isArray(design)) throw new DraftError(400, 'design must be an object')
    const at = revisionArg(revision)
    return this.serial(p, async () => {
      const have = this.revisionOf(p)
      if (at !== have) throw new DraftError(409, STALE_DRAFT, have)
      const rec: DraftRecord = { project: p, design: design as DraftDesign, updatedAt: this.now().toISOString(), revision: have + 1 }
      const json = JSON.stringify(rec, null, 1) + '\n'
      if (Buffer.byteLength(json) > DRAFT_LIMIT) throw new DraftError(413, `the design is larger than ${DRAFT_LIMIT / 1024} KB`)
      const file = this.abs(scenePaths(p).file)
      await mkdir(path.dirname(file), { recursive: true })
      // a tmp of its own per save (m5): two saves in flight never share one
      const tmp = `${file}.${process.pid}.${++this.saves}.tmp`
      await writeFile(tmp, json)
      await replaceFile(tmp, file) // Windows refuses a rename onto a file another save or the dev server holds open
      return rec
    })
  }

  /** an uploaded image as a real reference file under the draft (png, jpeg or webp, UPLOAD_LIMIT at most) */
  async upload(project: unknown, body: Buffer): Promise<UploadResponse> {
    const p = this.project(project)
    if (!body.length) throw new DraftError(400, 'the upload is empty')
    if (body.length > UPLOAD_LIMIT) throw new DraftError(413, `the image is larger than ${UPLOAD_LIMIT / 1024 / 1024} MB`)
    const ext = sniff(body)
    if (!ext) throw new DraftError(415, 'only PNG, JPEG or WebP images can be uploaded')
    const name = `u-${this.now().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${this.rand()}.${ext}`
    const dir = this.abs(scenePaths(p).refs)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, name), body)
    return { url: `/${scenePaths(p).refs}/${name}`, bytes: body.length, type: UPLOAD_TYPES[ext] }
  }

  /**
   * The draft into the world's Bible folder: every file under the project's scene folder the design points at is copied into
   * bible/elements/ (named by its run or upload, so nothing collides), the design is written beside bible.json with its URLs
   * rewritten to the copies. Nothing is removed (wave 3 M1): Build the set writes the Bible after this, and a refusal there must
   * leave the draft as it was; the draft stays with its scene. Concept runs stay where they are (their ledger history).
   */
  async migrate(project: unknown, worldId: unknown): Promise<DraftMigrateResponse> {
    const p = this.project(project)
    if (typeof worldId !== 'string' || !LOCATION_RE.test(worldId)) throw new DraftError(400, 'bad world id')
    if (!existsSync(this.abs(`lab-assets/locations/${worldId}`))) throw new DraftError(404, 'no such world')
    const draft = this.get(p)
    if (!draft) return { worldId, moved: {}, design: null }
    const prefix = `/${scenePaths(p).root}/`
    const re = new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')}[\\w./-]+\\.(?:png|jpg|webp)`, 'g')
    const json = JSON.stringify(draft.design)
    const bp = biblePaths(worldId)
    const moved: Record<string, string> = {}
    await mkdir(this.abs(bp.elements), { recursive: true })
    for (const url of new Set(json.match(re) ?? [])) {
      const rel = url.slice(1)
      if (rel.split('/').includes('..') || !existsSync(this.abs(rel))) continue
      const flat = rel.slice(scenePaths(p).root.length + 1).replace(/^draft\/refs\//, '').replace(/^concepts\//, '').replace(/\//g, '-')
      const to = `${bp.elements}/${flat}`
      await copyFile(this.abs(rel), this.abs(to))
      moved[url] = `/${to}`
    }
    const design = JSON.parse(json.replace(re, (u) => moved[u] ?? u)) as DraftDesign
    await writeFile(this.abs(`${bp.root}/design.json`), JSON.stringify({ project: p, design, migratedAt: this.now().toISOString() }, null, 1) + '\n')
    return { worldId, moved, design }
  }
}

function revisionArg(v: unknown): number {
  if (!Number.isInteger(v) || (v as number) < 0) throw new DraftError(400, 'revision must be the number the draft was read at (0 for none)')
  return v as number
}
