/**
 * Concept candidates at SCENE_ROUTES.scene + '/concepts' (sceneContract.ts): the paid draw for Scene's look pieces and the extras
 * sheet, before any world exists. Money discipline as the master draw (bible/masterDraw.ts): every input check is free and first,
 * then the run's intent (prompt, seeds, price) is written beside its folder BEFORE the one job; the job's images land in that
 * folder and a result.json completes the run. One concept draw at a time (409), and none while a Cast, planner or master job
 * runs (they would queue silently on the runner's lock). A billed job whose images never landed is reported by GET and recovered
 * by id (POST /__lab/jobs/recover, free), then GET /concepts/run?id= completes it; nothing here ever resubmits.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PROJECT_ID_RE, DEFAULT_PROJECT } from '../../src/project/model.ts'
import {
  CONCEPT_CR, CONCEPT_INPUT, CONCEPT_MAX, conceptCredits, isConceptKind, PROP_PARTS, scenePaths,
  type ConceptQuality, type PropParts, type ConceptResponse, type ConceptStatus,
} from '../../src/shared/sceneContract.ts'
import { MASTER_KEY, isMasterLabel } from '../bible/masterDraw.ts'
import { CAST_KEY, isCastLabel } from '../cast/routes.ts'
import { exclusive, isFreeRefusal, isLive, JobError, running, runJob, type JobRuntime, type JobStore } from '../jobs/index.ts'
import { isPlannerLabel } from '../planner/finalize.ts'
import { PLANNER_KEY } from '../planner/round.ts'
import { buildConceptGraph, conceptPrompt, conceptSaveNode, QWEN_LIGHTNING_4 } from './conceptGraph.ts'
import { noComfyTarget } from '../comfy/index.ts'

export const CONCEPT_KEY = 'scene-concept'
const LABEL = 'scene-concept '
export const isConceptLabel = (label: string) => label.startsWith(LABEL)
export const RUN_RE = /^c-\d{14}-[a-z0-9]{4}$/

export interface Reply { status: number; body: unknown }
export interface ConceptCtx { publicDir: string; runtime: () => JobRuntime; configured: () => boolean; now?: () => Date; seed?: () => number; rand?: () => string }
interface Intent { runId: string; project: string; kind: ConceptResponse['kind']; quality: ConceptQuality; prompt: string; seeds: number[]; estimate: number; createdAt: string }

const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Reply => ({ status, body: { error, ...extra } })
const obj = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {})
class Bad extends Error {}
function text(v: unknown, name: string, max: number, required = false): string {
  if (v === undefined || v === null) { if (required) throw new Bad(`${name} must be text`); return '' }
  if (typeof v !== 'string' || (required && !v.trim())) throw new Bad(`${name} must be text`)
  if (v.length > max) throw new Bad(`${name} is longer than ${max} characters`)
  return v.trim()
}

export const conceptDir = (publicDir: string, project: string, runId?: string) =>
  path.join(publicDir, ...scenePaths(project).concepts.split('/'), ...(runId ? [runId] : []))
const urlsOf = (project: string, runId: string, n: number) => Array.from({ length: n }, (_, k) => `/${scenePaths(project).concepts}/${runId}/c-${k + 1}.png`)
const partsOf = (label: string) => { const [, project, runId] = label.split(' '); return { project, runId } }

/** the request as an intent; throws Bad for anything wrong (free, no disk) */
function intentOf(ctx: ConceptCtx, b: Record<string, unknown>): Intent {
  const project = b.project === undefined ? DEFAULT_PROJECT : String(b.project)
  if (!PROJECT_ID_RE.test(project)) throw new Bad('bad project id')
  if (!isConceptKind(b.kind)) throw new Bad('kind must be location, mood, lighting, material, prop, beat or group')
  const quality = (b.quality ?? 'full') as ConceptQuality
  if (quality !== 'full' && quality !== 'draft') throw new Bad('quality must be "full" or "draft"')
  const count = Number(b.count ?? 1)
  if (!Number.isInteger(count) || count < 1 || count > CONCEPT_MAX) throw new Bad(`count must be 1 to ${CONCEPT_MAX}`)
  const description = text(b.description, 'description', CONCEPT_INPUT.description, true)
  text(b.name, 'name', CONCEPT_INPUT.name)
  const lighting = text(b.lighting, 'lighting', CONCEPT_INPUT.line), materials = text(b.materials, 'materials', CONCEPT_INPUT.line)
  // (prop-draw-parts) a prop's edited parts: each an optional string, '' leaves its part out
  let parts: PropParts | undefined
  if (b.parts !== undefined) {
    if (b.kind !== 'prop' || !b.parts || typeof b.parts !== 'object' || Array.isArray(b.parts)) throw new Bad('parts are for a prop draw: { view?, setup?, light?, rules? }')
    const raw = b.parts as Record<string, unknown>
    for (const k of Object.keys(raw)) if (!(PROP_PARTS as readonly string[]).includes(k)) throw new Bad(`parts.${k} is not a part (view, setup, light, rules)`)
    parts = {}
    for (const k of PROP_PARTS) if (raw[k] !== undefined) { if (typeof raw[k] !== 'string') throw new Bad(`parts.${k} must be text`); parts[k] = text(raw[k], `parts.${k}`, CONCEPT_INPUT.line) }
  }
  if (b.seed !== undefined && !(Number.isInteger(b.seed) && (b.seed as number) >= 0 && (b.seed as number) < 2 ** 31)) throw new Bad('seed must be a non-negative integer')
  const now = (ctx.now ?? (() => new Date()))()
  const base = (b.seed as number | undefined) ?? (ctx.seed ?? (() => Math.floor(Math.random() * 2 ** 31)))()
  const rand = (ctx.rand ?? (() => Math.random().toString(36).slice(2, 6).padEnd(4, '0')))()
  return {
    runId: `c-${now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${rand}`, project, kind: b.kind, quality,
    prompt: conceptPrompt(b.kind, { description, lighting, materials, ...(parts ? { parts } : {}) }), seeds: Array.from({ length: count }, (_, k) => (base + k * 7919) % 2 ** 31),
    estimate: conceptCredits(quality, count), createdAt: now.toISOString(),
  }
}

const responseOf = (i: Intent, jobId: string | null, credits: number | null): ConceptResponse =>
  ({ runId: i.runId, kind: i.kind, quality: i.quality, urls: urlsOf(i.project, i.runId, i.seeds.length), jobId, credits, estimate: i.estimate, prompt: i.prompt, createdAt: i.createdAt })

async function draw(ctx: ConceptCtx, i: Intent): Promise<Reply> {
  const rt = ctx.runtime()
  const dir = conceptDir(ctx.publicDir, i.project, i.runId)
  return exclusive(CONCEPT_KEY, `concept candidates (${i.kind})`, rt.store, isConceptLabel, async () => {
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'intent.json'), JSON.stringify(i, null, 2) + '\n') // before the spend: a restart can still land it
    try {
      const r = await runJob(rt, {
        graph: buildConceptGraph({ prompt: i.prompt, seeds: i.seeds, quality: i.quality, kind: i.kind, prefix: `canvas-stage/concept-${i.kind}` }),
        label: `${LABEL}${i.project} ${i.runId}`, estimateCredits: i.estimate, note: `scene ${i.kind} concepts x${i.seeds.length} (${i.quality}, ${i.estimate} cr estimated)`,
        ...(i.quality === 'draft' ? { allowModels: [QWEN_LIGHTNING_4] } : {}),
        outputs: Object.fromEntries(i.seeds.map((_, k) => [conceptSaveNode(k), { dir, name: `c-${k + 1}` }])),
      })
      const out = responseOf(i, r.jobId, r.costCredits)
      await writeFile(path.join(dir, 'result.json'), JSON.stringify(out, null, 2) + '\n')
      return { status: 200, body: out }
    } catch (e) {
      // refused before any spend: nothing to recover, so the intent goes
      if (e instanceof JobError && !e.jobId && (isFreeRefusal(e) || (e as JobError).code === 'submit')) await rm(dir, { recursive: true, force: true })
      // billed: the run id goes with the job id, so the tile can recover it by id and complete it from GET /concepts/run (m3)
      if (e && typeof e === 'object' && (e as { jobId?: unknown }).jobId) Object.assign(e, { runId: i.runId })
      throw e
    }
  }, [{ key: CAST_KEY, match: isCastLabel }, { key: PLANNER_KEY, match: isPlannerLabel }, { key: MASTER_KEY, match: isMasterLabel }])
}

/** a run whose images are all on disk (a job recovered by id) completed into its result; null = not landed */
async function complete(publicDir: string, jobs: JobStore, project: string, runId: string): Promise<ConceptResponse | null> {
  const dir = conceptDir(publicDir, project, runId)
  const res = path.join(dir, 'result.json')
  if (existsSync(res)) return JSON.parse(readFileSync(res, 'utf8')) as ConceptResponse
  const ip = path.join(dir, 'intent.json')
  if (!existsSync(ip)) return null
  const i = JSON.parse(readFileSync(ip, 'utf8')) as Intent
  if (i.seeds.some((_, k) => !existsSync(path.join(dir, `c-${k + 1}.png`)))) return null
  const rec = jobs.list().find((r) => isConceptLabel(r.label) && partsOf(r.label).runId === runId)
  const out = responseOf(i, rec?.jobId ?? null, rec?.costCredits ?? null)
  await writeFile(res, JSON.stringify(out, null, 2) + '\n')
  return out
}

export function conceptStatus(ctx: ConceptCtx): ConceptStatus {
  const store = ctx.runtime().store
  const r = running(CONCEPT_KEY, store, isConceptLabel)
  const unrecovered = store.list().filter((x) => isConceptLabel(x.label) && x.jobId && (x.status === 'needs-recover' || ((x.status === 'waiting' || x.status === 'submitting') && !isLive(x))))
    .filter((x) => { const p = partsOf(x.label); return !existsSync(path.join(conceptDir(ctx.publicDir, p.project, p.runId), 'result.json')) })
    .map((x) => ({ jobId: x.jobId!, runId: partsOf(x.label).runId, since: x.createdAt }))
  return { prices: { ...CONCEPT_CR }, max: CONCEPT_MAX, running: r ? { since: r.since, what: r.what } : null, unrecovered }
}

/** the run ids with an intent on disk for a project (tests and the status) */
export const conceptRuns = (publicDir: string, project: string) => {
  const d = conceptDir(publicDir, project)
  return existsSync(d) ? readdirSync(d).filter((n) => RUN_RE.test(n)).sort() : []
}

export async function handleConcepts(ctx: ConceptCtx, method: string, sub: string, query: URLSearchParams, body: unknown): Promise<Reply> {
  try {
    if (method === 'GET' && sub === '') return { status: 200, body: conceptStatus(ctx) }
    if (method === 'GET' && sub === '/run') {
      const runId = String(query.get('id') ?? ''), project = String(query.get('project') ?? DEFAULT_PROJECT)
      if (!RUN_RE.test(runId) || !PROJECT_ID_RE.test(project)) return fail(400, 'bad run id')
      const out = await complete(ctx.publicDir, ctx.runtime().store, project, runId)
      if (out) return { status: 200, body: out }
      return existsSync(conceptDir(ctx.publicDir, project, runId)) ? fail(409, 'its images have not landed: recover the job by id first', { runId }) : fail(404, 'no such run')
    }
    if (method !== 'POST' || sub !== '') return fail(method === 'POST' ? 404 : 405, method === 'POST' ? 'no such route' : 'method not allowed')
    const intent = intentOf(ctx, obj(body))
    if (!ctx.configured()) return fail(503, noComfyTarget())
    return await draw(ctx, intent)
  } catch (e) {
    if (e instanceof Bad) return fail(400, e.message)
    // the runner's refusals (busy 409, budget 429, invalid 400, no budget 503) and billed failures (502 + jobId: recover by id)
    const x = e as { status?: unknown; jobId?: unknown; runId?: unknown; running?: unknown }
    const status = typeof x.status === 'number' && x.status >= 400 && x.status < 600 ? x.status : 500
    return { status, body: { error: e instanceof Error ? e.message : String(e), ...(typeof x.jobId === 'string' ? { jobId: x.jobId, ...(typeof x.runId === 'string' ? { runId: x.runId } : {}) } : {}),
      ...(x.running ? { running: x.running } : {}) } }
  }
}
