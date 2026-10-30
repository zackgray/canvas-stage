// Following a clay on the server after its finish: re-read it until it is done (or failed: thrown), reporting progress. Shared
// by the panorama export (phase 'shade') and the kit export (phase 'encode').
import type { ClayExport } from '../../../shared/shotContract'
import { getClay } from './api'
import type { ClayExportDeps, ClayProgress } from './exportClay'

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Follow a finished-and-running clay on the server until it is done (or failed: thrown). Shared by both paths. */
export async function followClay(takeId: string, first: ClayExport, phase: 'shade' | 'encode', total: number, onProgress: (p: ClayProgress) => void, deps: ClayExportDeps): Promise<ClayExport> {
  const f = deps.fetch ?? fetch
  let clay = first
  const sleep = deps.sleep ?? wait
  const t0 = Date.now()
  while (clay.status === 'running' || clay.status === 'queued') {
    onProgress({ phase, done: clay.done ?? 0, total })
    if (Date.now() - t0 > (deps.timeoutMs ?? 30 * 60_000)) throw new Error('the clay is still shading; check back later')
    await sleep(deps.pollMs ?? 1000)
    clay = (await getClay(takeId, f)) ?? clay
  }
  if (clay.status === 'failed') throw new Error(clay.error ?? 'the clay export failed')
  onProgress({ phase, done: total, total })
  return clay
}
