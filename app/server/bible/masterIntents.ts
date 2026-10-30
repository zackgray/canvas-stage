/**
 * M5: the master draw's paid output never goes unseen. Before the job, each candidate is written as an intent beside the
 * masters (`bible/master/intent-<id>.json`, the seed and when); the Bible itself is untouched until a candidate lands, because
 * every Bible write is a new version and a version bump marks every still drawn against it stale. Scene's GET completes an
 * intent whose png is on disk (a job recovered by id after a restart) into a candidate, priced from its job record, and
 * reports the master jobs that were billed but whose pngs never landed, so Scene can offer Recover (free, by id).
 */
import { existsSync } from 'node:fs'
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { biblePaths, type BibleMaster, type BibleUnrecovered } from '../../src/shared/bibleContract.ts'
import { isLive, type JobRecord, type JobStore } from '../jobs/index.ts'
import type { BibleStore } from './store.ts'
import { isMasterId } from './validate.ts'

export interface MasterIntent { id: string; seed: number; madeBy: string; depthStrength: number; createdAt: string }

const LABEL = 'bible-master '
const masterDir = (publicDir: string, worldId: string) => path.join(publicDir, ...biblePaths(worldId).master.split('/'))
const intentPath = (dir: string, id: string) => path.join(dir, `intent-${id}.json`)
/** a master record's world and candidate ids (`bible-master <world> <id> <id>`) */
const partsOf = (r: JobRecord) => { const [, world, ...ids] = r.label.split(' '); return { world, ids } }
const isMaster = (r: JobRecord) => r.label.startsWith(LABEL)

export async function writeMasterIntents(publicDir: string, worldId: string, intents: MasterIntent[]): Promise<void> {
  const dir = masterDir(publicDir, worldId)
  for (const m of intents) await writeFile(intentPath(dir, m.id), JSON.stringify(m, null, 2) + '\n')
}
export async function dropMasterIntents(publicDir: string, worldId: string, ids: string[]): Promise<void> {
  const dir = masterDir(publicDir, worldId)
  for (const id of ids) await rm(intentPath(dir, id), { force: true })
}

/** Completes landed intents into Bible candidates (one version for all of them) and lists the billed jobs still to recover. */
export async function completeMasters(publicDir: string, store: BibleStore, jobs: JobStore, worldId: string): Promise<BibleUnrecovered[]> {
  const dir = masterDir(publicDir, worldId)
  if (!existsSync(dir)) return []
  const bible = await store.get(worldId)
  const have = new Set((bible?.candidates ?? []).map((c) => c.id))
  const records = jobs.list().filter((r) => isMaster(r) && partsOf(r).world === worldId)
  const landed: BibleMaster[] = [], done: string[] = []
  for (const f of await readdir(dir)) {
    const m = /^intent-(.+)\.json$/.exec(f)
    if (!m || !isMasterId(m[1])) continue
    const id = m[1]
    if (have.has(id)) { done.push(id); continue }
    if (!existsSync(path.join(dir, `${id}.png`))) continue
    const intent = JSON.parse(await readFile(path.join(dir, f), 'utf8')) as MasterIntent
    const rec = records.find((r) => partsOf(r).ids.includes(id))
    const n = rec ? partsOf(rec).ids.length : 1
    landed.push({ id, png: `/${biblePaths(worldId).master}/${id}.png`, madeBy: intent.madeBy, seed: intent.seed, depthStrength: intent.depthStrength,
      jobId: rec?.jobId ?? null, credits: rec?.costCredits != null ? Math.round((rec.costCredits / n) * 100) / 100 : 0, createdAt: intent.createdAt })
    done.push(id)
  }
  if (landed.length) await store.addCandidates(worldId, landed)
  await dropMasterIntents(publicDir, worldId, done)
  return records.filter((r) => r.jobId && (r.status === 'needs-recover' || ((r.status === 'waiting' || r.status === 'submitting') && !isLive(r))))
    .filter((r) => partsOf(r).ids.some((id) => !existsSync(path.join(dir, `${id}.png`))))
    .map((r) => ({ jobId: r.jobId!, ids: partsOf(r).ids, since: r.createdAt }))
}
