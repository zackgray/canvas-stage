/**
 * The Bible's master candidates, drawn by the same depth-locked Qwen-Image 2512 graph as every kit still (plan §3.3 "Master"):
 * A1's POST /__lab/bible/master calls drawMasterCandidates and owns everything around it (the claim, the store, approve).
 * Input: the master view's metric depth (a 16-bit zdepth PNG, as the kit clay writes) and the composed prompt. One job, 1..2
 * seeds, 1920x1088 PNGs written as <outDir>/<name>.png. Paid (masterCredits a seed): the caller has already priced and refused for free.
 * Note: a kit world's master view (still.png) has no metric depth on disk yet; whoever captures it must also capture its zdepth.
 */
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { runJob, type JobRuntime } from '../jobs/index.ts'
import { writeDepthControl } from './depthImage.ts'
import { QWEN_DEPTH_CR } from '../../src/shared/bibleContract.ts'
import { lockFor } from './lockPresets.ts'
import { buildQwenDepthGraph, QWEN_NODES, qwenSaveNode } from './qwenGraph.ts'

export const MASTER_MADE_BY = 'qwen-image-2512+union-depth'
export const masterCredits = (count: number) => QWEN_DEPTH_CR * Math.max(1, count)

export interface MasterDraw {
  /** the master view's zdepth (16-bit planar metres x CLAY_DEPTH_UNIT_M) */
  zdepthFile: string
  prompt: string
  /** one per candidate (1..2): its seed and the file name it lands as (no extension) */
  picks: { seed: number; name: string }[]
  outDir: string
  /** the jobs-list label, e.g. `bible-master loc-… m-…` */
  label: string
  depthStrength?: number
  /** the share of the steps the depth holds for (end_percent); unset = to the end */
  depthEnd?: number
}

export interface MasterResult { jobId: string; credits: number | null; files: string[]; madeBy: string; depthStrength: number }

export async function drawMasterCandidates(rt: JobRuntime, o: MasterDraw): Promise<MasterResult> {
  if (!o.picks.length || o.picks.length > 2) throw Object.assign(new Error('a master draw is 1 or 2 seeds'), { status: 400 })
  await mkdir(o.outDir, { recursive: true })
  const depthPng = path.join(o.outDir, 'master-depth.png')
  writeDepthControl(o.zdepthFile, depthPng)
  // no strength asked: the recipe's photographic lock (tidy wave), as a still's press; a strength alone holds to the end as before
  const dflt = lockFor({})
  const strength = o.depthStrength ?? dflt.strength, end = o.depthStrength === undefined ? o.depthEnd ?? dflt.end : o.depthEnd
  const r = await runJob(rt, {
    graph: buildQwenDepthGraph({ prompt: o.prompt, seeds: o.picks.map((p) => p.seed), prefix: 'canvas-stage/bible-master', strength, end, noPeople: true }),
    label: o.label, estimateCredits: masterCredits(o.picks.length),
    outputs: Object.fromEntries(o.picks.map((p) => [qwenSaveNode(p.seed), { dir: o.outDir, name: p.name }])),
    binds: [[QWEN_NODES.depth, 'image', depthPng]], note: `${o.label} (${masterCredits(o.picks.length)} cr estimated)`, timeoutMs: 20 * 60_000,
  })
  const files = o.picks.map((p) => path.join(o.outDir, `${p.name}.png`))
  const lost = files.filter((f) => !existsSync(f))
  if (lost.length) throw Object.assign(new Error(`job ${r.jobId} succeeded but ${lost.length} master(s) did not land; look it up by id, do not resubmit.`), { status: 422, jobId: r.jobId })
  return { jobId: r.jobId, credits: r.costCredits, files, madeBy: MASTER_MADE_BY, depthStrength: strength }
}
