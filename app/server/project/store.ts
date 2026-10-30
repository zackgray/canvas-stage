/**
 * Project documents on disk: public/lab-assets/projects/<id>/project.json (gitignored). Every write goes to a temp
 * file in the same folder and is renamed over the old one, so a reader never sees half a project. Writes to one
 * project are serialised in this process, so the revision check and the write cannot interleave.
 */
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PROJECT_ID_RE, type Project } from '../../src/project/model.ts'
import { parseProject } from '../../src/project/parse.ts'
import { replaceFile } from '../replace.ts'

export interface ProjectSummary {
  id: string
  name: string
  created: string
  revision: number
  shots: number
}

export function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status })
}

export class ProjectStore {
  readonly root: string
  private queues = new Map<string, Promise<unknown>>()

  constructor(publicDir: string) {
    this.root = path.join(publicDir, 'lab-assets', 'projects')
  }

  file(id: string): string {
    if (!PROJECT_ID_RE.test(id)) throw httpError(400, 'bad project id')
    const f = path.resolve(this.root, id, 'project.json')
    if (!f.startsWith(this.root + path.sep)) throw httpError(400, 'bad project id')
    return f
  }

  async read(id: string): Promise<Project | null> {
    const f = this.file(id)
    if (!existsSync(f)) return null
    return parseProject(JSON.parse(await readFile(f, 'utf8')))
  }

  async list(): Promise<ProjectSummary[]> {
    if (!existsSync(this.root)) return []
    const out: ProjectSummary[] = []
    for (const id of (await readdir(this.root)).filter((n) => PROJECT_ID_RE.test(n)).sort()) {
      try {
        const p = await this.read(id)
        if (p) out.push({ id: p.id, name: p.name, created: p.created, revision: p.revision, shots: p.shots.length })
      } catch { /* an unreadable project is left on disk and unlisted */ }
    }
    return out
  }

  /** Runs `fn` after every earlier write to the same project has settled. */
  private serial<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const run = (this.queues.get(id) ?? Promise.resolve()).catch(() => {}).then(fn)
    this.queues.set(id, run)
    return run
  }

  private async write(p: Project): Promise<void> {
    const f = this.file(p.id)
    await mkdir(path.dirname(f), { recursive: true })
    const tmp = `${f}.${process.pid}.${Date.now()}.tmp`
    try {
      await writeFile(tmp, JSON.stringify(p, null, 2) + '\n')
      await replaceFile(tmp, f)
    } finally {
      await rm(tmp, { force: true })
    }
  }

  /**
   * Saves a whole document over the stored one. Its revision must equal the stored revision (0 for a new project),
   * else 409; the saved copy carries revision + 1 and is returned.
   */
  save(doc: Project): Promise<Project> {
    return this.serial(doc.id, async () => {
      const cur = await this.read(doc.id)
      const have = cur?.revision ?? 0
      if (doc.revision !== have) throw Object.assign(httpError(409, `stale revision ${doc.revision}: the project is at ${have}`), { revision: have })
      const next = { ...doc, revision: have + 1 }
      await this.write(next)
      return next
    })
  }

  /** Read, change and save one project under the write lock (404 when it does not exist). */
  update(id: string, change: (p: Project) => Project): Promise<Project> {
    return this.serial(id, async () => {
      const cur = await this.read(id)
      if (!cur) throw httpError(404, 'no such project')
      const next = { ...parseProject(change(cur)), revision: cur.revision + 1 }
      await this.write(next)
      return next
    })
  }

  /** Writes `make()` only when the project does not exist yet; returns what is on disk either way. */
  createIfAbsent(id: string, make: () => Promise<Project>): Promise<{ project: Project; created: boolean }> {
    return this.serial(id, async () => {
      const cur = await this.read(id)
      if (cur) return { project: cur, created: false }
      const p = { ...parseProject(await make()), revision: 1 }
      await this.write(p)
      return { project: p, created: true }
    })
  }
}
