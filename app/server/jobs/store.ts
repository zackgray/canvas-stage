/** One JSON record per job on disk (<dir>/<id>.json), written atomically; the in-flight list survives a crash. */
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { OPEN, type JobRecord } from './types.ts'

export class JobStore {
  readonly dir: string
  constructor(dir: string) { this.dir = dir }

  private file(id: string) { return path.join(this.dir, `${id}.json`) }

  save(r: JobRecord): JobRecord {
    r.updatedAt = new Date().toISOString()
    mkdirSync(this.dir, { recursive: true })
    const tmp = this.file(r.id) + '.tmp'
    writeFileSync(tmp, JSON.stringify(r, null, 2) + '\n')
    renameSync(tmp, this.file(r.id))
    return r
  }

  /** Every record, newest first (torn or foreign files are skipped). */
  list(): JobRecord[] {
    let names: string[]
    try { names = readdirSync(this.dir) } catch { return [] }
    const out: JobRecord[] = []
    for (const n of names) {
      if (!/^job-[\w-]+\.json$/.test(n)) continue
      try { const r = JSON.parse(readFileSync(path.join(this.dir, n), 'utf8')) as JobRecord; if (r?.id) out.push(r) } catch { /* skip */ }
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  open(): JobRecord[] { return this.list().filter((r) => OPEN.includes(r.status)) }
  byJobId(jobId: string): JobRecord | undefined {
    return this.list().find((r) => r.jobId === jobId || r.attempts.some((a) => a.jobId === jobId))
  }
}

export const newRecordId = () => `job-${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 6)}`
