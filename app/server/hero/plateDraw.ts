/**
 * Step B of "Draw from your approved frame": the plate, the empty set drawn for this angle (~17 cr, one seed). The app's own Qwen
 * depth draw (qwenGraph.ts, `noPeople`, the Photographic lock) on the empty depth, with a place-only prompt (platePrompt.ts). It
 * lands as `plate-NNN.png` with its own `plate-NNN.json` (seed, prompt, job, credits, startKey), the json written BEFORE the job (job and credits
 * filled in after it), so a png that landed is never drawn and billed twice. A plate is reused by
 * every later press of this mode on the same take, frame and start key, so a redraw and a second seed cost only the edit; a plate
 * that landed while the edit failed is kept for the next press. The job's label token is the plate's name, so a plate whose png
 * never landed shows under Recover like a draw (store.ts unrecovered).
 */
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import type { TakeRecord } from '../../src/shared/shotContract.ts'
import { runJob, type JobRuntime } from '../jobs/index.ts'
import { PLATE_CREDITS } from './editSpec.ts'
import { LOCK_PRESETS } from './lockPresets.ts'
import { buildQwenDepthGraph, QWEN_NODES, qwenSaveNode } from './qwenGraph.ts'
import { heroLabel } from './spec.ts'
import { heroUrl, HeroHttpError, readJson, writeJson } from './store.ts'

export interface PlateRecord { id: string; takeId: string; startKey: string; frame: number; seed: number; prompt: string; jobId: string | null; credits: number; png: string; createdAt: string }

export const plateId = (frame: number) => `plate-${String(frame).padStart(3, '0')}`

/** the take's plate at `frame` when it landed for this start of the take, else null (a stale one is drawn again) */
export async function readPlate(dir: string, take: Pick<TakeRecord, 'id' | 'startKey'>, frame: number): Promise<PlateRecord | null> {
  const id = plateId(frame)
  const rec = await readJson<PlateRecord>(path.join(dir, `${id}.json`))
  return rec && rec.id === id && rec.takeId === take.id && rec.startKey === take.startKey && existsSync(path.join(dir, `${id}.png`)) ? { ...rec, png: heroUrl(take.id, `${id}.png`) } : null
}

/** Draws the plate on `emptyDepth` (a PNG) and writes its json; returns it. Budget is the caller's (it checks both jobs at once). */
export async function drawPlate(rt: JobRuntime, o: { take: TakeRecord; dir: string; frame: number; seed: number; prompt: string; emptyDepth: string; now: Date }): Promise<PlateRecord> {
  const { take, dir, frame, seed } = o, id = plateId(frame)
  const lock = LOCK_PRESETS.photographic
  // the record goes down BEFORE the paid job (jobId null, credits 0, like a still's intent): a plate whose png landed is a plate even
  // if the finish below never ran. The old png goes first, so a pending record with a png always means this job landed it.
  const rec: PlateRecord = { id, takeId: take.id, startKey: take.startKey, frame, seed, prompt: o.prompt, jobId: null, credits: 0, png: heroUrl(take.id, `${id}.png`), createdAt: o.now.toISOString() }
  rmSync(path.join(dir, `${id}.png`), { force: true })
  await writeJson(path.join(dir, `${id}.json`), rec)
  const r = await runJob(rt, {
    graph: buildQwenDepthGraph({ prompt: o.prompt, seeds: [seed], prefix: `canvas-stage/${take.id}-plate`, strength: lock.strength, end: lock.end, noPeople: true }),
    label: heroLabel(take.id, [id]), estimateCredits: PLATE_CREDITS, outputs: { [qwenSaveNode(seed)]: { dir, name: id } }, binds: [[QWEN_NODES.depth, 'image', o.emptyDepth]],
    note: `${take.id} f${frame} plate (empty set) ${lock.id} lock (${PLATE_CREDITS} cr estimated)`, timeoutMs: 20 * 60_000,
  })
  if (!existsSync(path.join(dir, `${id}.png`))) throw new HeroHttpError(422, `job ${r.jobId} succeeded but the plate did not land; look it up by id, do not resubmit.`, 'bad_output')
  const done: PlateRecord = { ...rec, jobId: r.jobId ?? null, credits: r.costCredits ?? 0 }
  await writeJson(path.join(dir, `${id}.json`), done) // finalised: the job and its bill
  return done
}
