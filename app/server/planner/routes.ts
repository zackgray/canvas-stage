/** HTTP routes at PLANNER_ROUTES.planner (bibleContract.ts), as pure handlers. Every input check here is free and comes first. */
import type { DevelopMode, PlannerStatus } from '../../src/shared/bibleContract.ts'
import { LIMITS as PLAN_LIMITS } from '../../src/stage3d/planRules.ts'
import { isLive, running } from '../jobs/index.ts'
import { developUser, fleshUser } from './briefPrompt.ts'
import { finalizeRun, isPlannerLabel, runJobs } from './finalize.ts'
import { COLD_CR, jobCredits, MAX_ITEMS, PER_ITEM_CR } from './gemma.ts'
import { planLightOf } from './planBriefLight.ts'
import { PLANNER_KEY, runPlanner, type PlannerCtx } from './round.ts'
import { PlannerError, type RunIntent } from './store.ts'
import { noComfyTarget } from '../comfy/index.ts'

export interface Reply { status: number; body: unknown }
export const INPUT = { idea: 2000, name: 80, description: 1200, scene: 1500 } as const
export const PRICES: PlannerStatus['prices'] = { single: jobCredits(1), cold: COLD_CR, perItem: PER_ITEM_CR, retry: 'an answer that fails the check costs one more job of the same size (once)' }

export interface RouteCtx extends PlannerCtx { now: () => Date; seed: () => number; configured: () => boolean }

const obj = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {})
const bad = (m: string) => new PlannerError(400, m)
function text(v: unknown, name: string, max: number, required = true): string {
  if (v === undefined && !required) return ''
  if (typeof v !== 'string' || (required && !v.trim())) throw bad(`${name} must be text`)
  if (v.length > max) throw bad(`${name} is longer than ${max} characters`)
  return v.trim()
}
function seedOf(v: unknown, ctx: RouteCtx): number {
  if (v === undefined) return ctx.seed()
  if (!Number.isInteger(v) || (v as number) < 0 || (v as number) >= 2 ** 31) throw bad('seed must be a non-negative integer')
  return v as number
}

/** the request as an intent (throws 400 for anything wrong); no disk, no spend */
export function intentFor(ctx: RouteCtx, kind: RunIntent['kind'], body: unknown): RunIntent {
  const b = obj(body)
  const now = ctx.now()
  const base = { runId: ctx.store.newRunId(now), kind, seed: seedOf(b.seed, ctx), createdAt: now.toISOString() }
  if (kind === 'plan') {
    const list = b.prompts ?? (b.prompt !== undefined ? [b.prompt] : undefined)
    if (!Array.isArray(list) || !list.length || list.length > MAX_ITEMS) throw bad(`prompts must be a list of 1 to ${MAX_ITEMS} scene sentences`)
    const prompts = list.map((p, i) => text(p, `prompts[${i}]`, PLAN_LIMITS.sentence))
    // the brief's key light: every plan of this run is lit by it (finalize.ts, planBriefLight.ts)
    const light = planLightOf(b.light)
    if (typeof light === 'string') throw bad(light)
    return { ...base, request: { prompts, ...(light ? { light } : {}) }, items: prompts.map((p, i) => ({ key: `p${i}`, user: p })), estimateCredits: jobCredits(prompts.length) }
  }
  if (kind === 'develop') {
    const idea = text(b.idea, 'idea', INPUT.idea)
    const mode = (b.mode ?? 'full') as DevelopMode
    if (mode !== 'light' && mode !== 'full') throw bad('mode must be "light" or "full"')
    return { ...base, request: { idea, mode }, items: [{ key: 'brief', user: developUser(idea, mode) }], estimateCredits: jobCredits(1) }
  }
  const name = text(b.name, 'name', INPUT.name)
  const description = text(b.description ?? '', 'description', INPUT.description, false)
  const scene = text(b.scene, 'scene', INPUT.scene, false)
  return { ...base, request: { name, description, scene }, items: [{ key: 'flesh', user: fleshUser(name, description, scene) }], estimateCredits: jobCredits(1) }
}

export async function handlePlanner(ctx: RouteCtx, method: string, sub: string, query: URLSearchParams, body: unknown): Promise<Reply> {
  try {
    const rt = ctx.runtime()
    if (method === 'GET' && sub === '') {
      const r = running(PLANNER_KEY, rt.store, isPlannerLabel)
      const unrecovered = rt.store.list().filter((x) => isPlannerLabel(x.label) && x.jobId && (x.status === 'needs-recover' || ((x.status === 'waiting' || x.status === 'submitting') && !isLive(x))))
        .map((x) => ({ jobId: x.jobId!, runId: x.label.split(' ')[2] ?? '', since: x.createdAt }))
      // the day budget as a local read (budget.json), so a press it would refuse is said before the press
      const cap = rt.budget.cap()
      const budget = { cap, remaining: cap === null ? null : Math.max(0, Math.round((cap - rt.budget.spentToday()) * 10) / 10) }
      return { status: 200, body: { prices: PRICES, running: r ? { since: r.since, what: r.what } : null, unrecovered, budget } satisfies PlannerStatus }
    }
    if (method === 'GET' && sub === '/run') {
      const runId = String(query.get('id') ?? '')
      const done = ctx.store.readResult(runId)
      if (done) return { status: done.errors ? 422 : 200, body: done }
      const intent = ctx.store.readIntent(runId)
      if (!intent) return { status: 404, body: { error: 'no such run' } }
      const open = runJobs(rt.store, runId).open
      if (open.length || running(PLANNER_KEY, rt.store, isPlannerLabel)?.what.includes(runId)) return { status: 409, body: { error: 'this run still has a job in the air or to recover by id', runId, jobIds: open } }
      return finalizeRun(ctx.store, rt.store, intent)
    }
    if (method !== 'POST') return { status: 405, body: { error: 'method not allowed' } }
    const kind = ({ '/plan': 'plan', '/develop': 'develop', '/flesh': 'flesh' } as const)[sub]
    if (!kind) return { status: 404, body: { error: 'no such route' } }
    const intent = intentFor(ctx, kind, body)
    if (!ctx.configured()) return { status: 503, body: { error: noComfyTarget() } }
    return await runPlanner(ctx, intent)
  } catch (e) {
    if (e instanceof PlannerError) return { status: e.status, body: { error: e.message, ...e.extra } }
    // the runner's refusals (busy 409, budget 429, invalid 400, no target 503) and billed failures (502 + jobId: recover by id)
    const x = e as { status?: unknown; jobId?: unknown; running?: unknown }
    const status = typeof x.status === 'number' && x.status >= 400 && x.status < 600 ? x.status : 500
    return { status, body: { error: e instanceof Error ? e.message : String(e), ...(typeof x.jobId === 'string' ? { jobId: x.jobId } : {}), ...(x.running ? { running: x.running } : {}) } }
  }
}
