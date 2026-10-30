/**
 * The scene library on disk: public/lab-assets/scene/<sceneId>/scene.json (SceneDoc, libraryContract.ts), beside the scene's draft.
 * Every write goes to a temp file renamed over the old one, and writes to one scene are serialised process-wide (pinned on
 * globalThis, so the library plugin, the kit-world route and the draft route, each with its own store object, queue on one lock).
 * Writes from the page carry the revision they were read at; a stale one is refused (409) and nothing is written.
 * Free; no Comfy. Nothing here deletes a file: "remove from list" hides the scene.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DEFAULT_SCENE_NAME, SCENE_ID_RE, SCENE_NAME_MAX, type SceneDoc } from '../../src/shared/libraryContract.ts'
import { LOCATION_RE } from '../location/request.ts'
import { replaceFile } from '../replace.ts'

export class LibraryError extends Error {
  readonly status: number
  readonly revision?: number
  constructor(status: number, message: string, revision?: number) { super(message); this.status = status; this.revision = revision }
}

const KEY = Symbol.for('canvas-stage.scene.library.queues')
const queues = (): Map<string, Promise<unknown>> => ((globalThis as Record<symbol, Map<string, Promise<unknown>> | undefined>)[KEY] ??= new Map())

/** runs `fn` after every earlier write to the same scene has settled (process-wide) */
function serial<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const run = (queues().get(file) ?? Promise.resolve()).catch(() => {}).then(fn)
  queues().set(file, run)
  return run
}

export const sceneName = (v: unknown): string => {
  if (typeof v !== 'string') throw new LibraryError(400, 'the name must be text')
  const name = v.replace(/\s+/g, ' ').trim()
  if (!name) throw new LibraryError(400, 'the name is empty')
  if (name.length > SCENE_NAME_MAX) throw new LibraryError(400, `the name is longer than ${SCENE_NAME_MAX} characters`)
  return name
}

export class SceneLibrary {
  readonly root: string
  private readonly now: () => Date
  private readonly rand: () => string
  constructor(publicDir: string, now: () => Date = () => new Date(), rand = () => Math.random().toString(36).slice(2, 6).padEnd(4, '0')) {
    this.root = path.join(publicDir, 'lab-assets', 'scene'); this.now = now; this.rand = rand
  }

  file(id: unknown): string {
    if (typeof id !== 'string' || !SCENE_ID_RE.test(id)) throw new LibraryError(400, 'bad scene id')
    return path.join(this.root, id, 'scene.json')
  }

  read(id: unknown): SceneDoc | null {
    const f = this.file(id)
    if (!existsSync(f)) return null
    try { const d = JSON.parse(readFileSync(f, 'utf8')) as SceneDoc; return d && d.id === id ? d : null } catch { return null }
  }

  /** every readable scene document (hidden ones too) */
  all(): SceneDoc[] {
    if (!existsSync(this.root)) return []
    return readdirSync(this.root).filter((n) => SCENE_ID_RE.test(n)).map((n) => this.read(n)).filter((d): d is SceneDoc => !!d)
  }

  /** the scene a world was built in, or null */
  ownerOf(worldId: string): SceneDoc | null {
    return this.all().find((d) => d.worlds.some((w) => w.id === worldId)) ?? null
  }

  private async write(d: SceneDoc): Promise<void> {
    const f = this.file(d.id)
    await mkdir(path.dirname(f), { recursive: true })
    const tmp = `${f}.${process.pid}.${Date.now()}.tmp`
    try { await writeFile(tmp, JSON.stringify(d, null, 1) + '\n'); await replaceFile(tmp, f) } finally { await rm(tmp, { force: true }) }
  }

  private newId(): string {
    const stamp = this.now().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
    for (let i = 0; i < 20; i++) { const id = `sc-${stamp}-${this.rand()}`; if (!existsSync(this.file(id))) return id }
    throw new LibraryError(500, 'could not make a scene id')
  }

  async create(name?: unknown): Promise<SceneDoc> {
    const at = this.now().toISOString()
    const doc: SceneDoc = { id: this.newId(), name: name === undefined || name === '' ? DEFAULT_SCENE_NAME : sceneName(name), revision: 1, hidden: false,
      createdAt: at, updatedAt: at, worldId: null, worlds: [] }
    return serial(this.file(doc.id), async () => { await this.write(doc); return doc })
  }

  /**
   * Read, change and write one scene under its lock. `revision` (when given) must be the stored one, else 409 and nothing is
   * written; the written copy carries revision + 1. 404 when the scene does not exist.
   */
  change(id: unknown, revision: number | undefined, fn: (d: SceneDoc) => SceneDoc): Promise<SceneDoc> {
    const f = this.file(id)
    return serial(f, async () => {
      const cur = this.read(id)
      if (!cur) throw new LibraryError(404, 'no such scene')
      if (revision !== undefined && revision !== cur.revision) {
        throw new LibraryError(409, 'This scene was changed in another tab or window. Reload to see the newest version.', cur.revision)
      }
      const next = { ...fn(cur), id: cur.id, revision: cur.revision + 1, updatedAt: this.now().toISOString() }
      await this.write(next)
      return next
    })
  }

  rename(id: unknown, name: unknown, revision: unknown) { return this.change(id, rev(revision), (d) => ({ ...d, name: sceneName(name) })) }
  remove(id: unknown, revision: unknown) { return this.change(id, rev(revision), (d) => ({ ...d, hidden: true })) }

  /** one of the scene's own worlds becomes the current set (a world of another scene, or none, is refused) */
  setWorld(id: unknown, worldId: unknown, revision: unknown) {
    return this.change(id, rev(revision), (d) => {
      if (!d.worlds.some((w) => w.id === worldId)) throw new LibraryError(400, 'that set was not built in this scene')
      return { ...d, worldId: worldId as string }
    })
  }

  /**
   * A world just written for this scene (the kit-world route, in the same request): added to its list and made the current set.
   * Not revision-checked: the server does it, and the page reads the scene again after a build. A world already in another
   * scene is refused, so a world is reachable from exactly one scene.
   */
  attachWorld(id: unknown, worldId: string): Promise<SceneDoc> {
    if (!LOCATION_RE.test(worldId)) return Promise.reject(new LibraryError(400, 'bad world id'))
    const other = this.ownerOf(worldId)
    if (other && other.id !== id) return Promise.reject(new LibraryError(409, 'that set belongs to another scene'))
    return this.change(id, undefined, (d) => d.worlds.some((w) => w.id === worldId) ? { ...d, worldId }
      : { ...d, worldId, worlds: [...d.worlds, { id: worldId, builtAt: this.now().toISOString(), brief: null }] })
  }

  /** the brief the world's set was built from (its fingerprint), recorded when the draft moves into the world's Bible */
  markBuilt(id: unknown, worldId: string, fingerprint: string): Promise<SceneDoc | null> {
    if (typeof id !== 'string' || !SCENE_ID_RE.test(id) || !this.read(id)) return Promise.resolve(null)
    return this.change(id, undefined, (d) => ({ ...d, worlds: d.worlds.map((w) => (w.id === worldId ? { ...w, brief: fingerprint } : w)) }))
  }
}

function rev(v: unknown): number {
  if (!Number.isInteger(v) || (v as number) < 0) throw new LibraryError(400, 'revision must be the number the scene was read at')
  return v as number
}
