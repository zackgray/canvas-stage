/**
 * Download a finished job's outputs to their targets. Downloads are free and re-run nothing, so each file is retried.
 * Each file streams into a part file beside its target and is put in place only once whole (fix 2026-10-30): a still's png
 * existing is what lets the hero listing complete its intent and announce it (hero/store.ts listStills), so a page polling
 * during the download used to be handed a half-written png, and its image cache kept the truncated top part.
 */
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import type { Job } from '@comfyorg/sdk'
import { replaceFile } from '../replace.ts'
import type { OutputTarget } from './types.ts'

export interface Downloaded { saved: string[]; failed: string[] }

/** the part file a download streams into: the same folder (so the rename is atomic), a name no listing matches and shots/ never serves */
export const partOf = (file: string) => `${file}.part`

/** what `downloadOutputs` needs of one Cloud output */
export interface Downloadable { toFile: (file: string, o?: { timeoutMs?: number }) => Promise<unknown> }

/** streams `out` to `file` whole or not at all: the final name only ever appears complete */
export async function saveWhole(out: Downloadable, file: string, timeoutMs = 300_000): Promise<void> {
  const part = partOf(file)
  try {
    await out.toFile(part, { timeoutMs })
    await replaceFile(part, file)
  } catch (e) {
    await rm(part, { force: true })
    throw e
  }
}

export const outputCount = (job: Job, outputs: Record<string, OutputTarget>): number => {
  let n = 0
  for (const id of Object.keys(outputs)) { try { n += job.getOutputs(id).length } catch { /* none */ } }
  return n
}

export async function downloadOutputs(job: Job, outputs: Record<string, OutputTarget>): Promise<Downloaded> {
  const saved: string[] = []
  const failed: string[] = []
  for (const [nodeId, t] of Object.entries(outputs)) {
    const outs = job.getOutputs(nodeId)
    if (outs.length === 0) failed.push(`node ${nodeId}: no output`)
    for (const [i, out] of outs.entries()) {
      const name = String((out as { name?: string }).name ?? '')
      const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : ''
      const file = path.join(t.dir, `${t.name}${i > 0 ? `-${i}` : ''}${ext}`)
      await mkdir(t.dir, { recursive: true })
      let ok = false
      for (let a = 0; a < 3 && !ok; a++) {
        try { await saveWhole(out, file); ok = true } catch { /* retry the free download */ }
      }
      if (ok) saved.push(file)
      else failed.push(name || `node ${nodeId}`)
    }
  }
  return { saved, failed }
}
