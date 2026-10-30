/**
 * Graph validation against Cloud object_info, cached (memory + disk) and refreshable. A graph that fails against a
 * cached copy is re-checked once against a fresh fetch before it is refused (the cache may simply be old). Errors that
 * name a whitelisted per-user model are ignored (a LoRA is not in the shared object_info); the validator's known
 * MATCHTYPE_V3 blind spot is ignored as the experiments do.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { validateGraph } from '../../experiments/lib/validate.ts'
import type { ApiGraph, ObjectInfo } from '../comfy/index.ts'
import { mapCloudAuth } from '../comfy/errorHints.ts'
import { JobError } from './types.ts'

const MAX_AGE_MS = 24 * 3600_000

export class ObjectInfoCache {
  private mem: { info: ObjectInfo; at: number } | null = null
  private readonly fetchInfo: () => Promise<ObjectInfo>
  private readonly file: string
  constructor(fetchInfo: () => Promise<ObjectInfo>, file: string) {
    this.fetchInfo = fetchInfo
    this.file = file
  }

  async get(refresh = false): Promise<ObjectInfo> {
    if (!refresh && this.mem && Date.now() - this.mem.at < MAX_AGE_MS) return this.mem.info
    if (!refresh && !this.mem) {
      try {
        const j = JSON.parse(readFileSync(this.file, 'utf8')) as { at: number; info: ObjectInfo }
        if (Date.now() - j.at < MAX_AGE_MS) return (this.mem = j).info
      } catch { /* none yet */ }
    }
    const info = await this.fetchInfo()
    this.mem = { info, at: Date.now() }
    try { mkdirSync(path.dirname(this.file), { recursive: true }); writeFileSync(this.file, JSON.stringify(this.mem)) } catch { /* cache only */ }
    return info
  }
}

const errorsFor = (graph: ApiGraph, info: ObjectInfo, allow: string[]) =>
  validateGraph(graph, info).filter((e) => !/COMFY_MATCHTYPE_V3/.test(e) && !allow.some((m) => e.includes(m)))

/** Throws a 400 JobError listing what is wrong; passes silently when the graph fits object_info. */
export async function assertValid(graph: ApiGraph, cache: ObjectInfoCache, allow: string[] = []): Promise<void> {
  const g = Object.fromEntries(Object.entries(graph).filter(([k]) => !k.startsWith('_'))) as ApiGraph
  let errs: string[]
  try {
    errs = errorsFor(g, await cache.get(), allow)
    if (errs.length) errs = errorsFor(g, await cache.get(true), allow)
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    const auth = mapCloudAuth(why)
    throw new JobError('invalid', auth ?? `Cannot validate the graph (object_info unavailable): ${why}`, auth ? 401 : 503)
  }
  if (errs.length) throw new JobError('invalid', `Graph invalid against Cloud object_info: ${errs.slice(0, 6).join('; ')}${errs.length > 6 ? ` (+${errs.length - 6} more)` : ''}`, 400)
}
