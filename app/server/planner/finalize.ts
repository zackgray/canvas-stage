/**
 * Turning a run's saved answers into its response, from disk only (free): used right after the paid jobs and again by
 * GET /run?id= for a run whose jobs were recovered by id after a restart. Per answer: the first try if it passed, else the
 * retry if it passed, else (plans only) repairPlan + parsePlan. Plans that pass are written through the store's plan guard.
 */
import type { DevelopMode, DevelopResponse, FleshResponse, PlannedScene, PlanResponse, PlannerResponse } from '../../src/shared/bibleContract.ts'
import type { JobStore } from '../jobs/index.ts'
import { checkBriefText, checkFleshText, type DevelopedBrief } from './briefCheck.ts'
import { withBriefLight, type PlanLight } from './planBriefLight.ts'
import { finishPlan } from './finishPlan.ts'
import { checkPlanText, repairChecked } from './planText.ts'
import { PlannerError, type PlannerStore, type RunIntent } from './store.ts'

export const LABEL = 'planner '
export const isPlannerLabel = (label: string) => label.startsWith(LABEL)
export const runLabel = (i: Pick<RunIntent, 'kind' | 'runId'>, retry = false) => `${LABEL}${i.kind} ${i.runId}${retry ? ' retry' : ''}`
const runOf = (label: string) => label.split(' ')[2] ?? ''

type Rec = ReturnType<JobStore['list']>[number]
const isRetry = (label: string) => label.endsWith(' retry')
const sum = (done: Rec[]) => (done.length && done.every((r) => r.costCredits != null) ? Math.round(done.reduce((s, r) => s + (r.costCredits ?? 0), 0) * 10) / 10 : null)

/**
 * the run's jobs as the runner recorded them: ids, the measured credits (null when any is unmeasured), and whether the internal
 * retry ran (a second billed row for one press: the response says so, with what the retry alone cost)
 */
export function runJobs(jobs: JobStore, runId: string): { jobIds: string[]; credits: number | null; open: string[]; retried: boolean; retryCredits: number | null; spentCredits: number } {
  const recs = jobs.list().filter((r) => isPlannerLabel(r.label) && runOf(r.label) === runId).reverse()
  const jobIds = recs.flatMap((r) => (r.jobId ? [r.jobId] : []))
  const done = recs.filter((r) => r.status === 'done')
  const open = recs.filter((r) => r.status === 'needs-recover' || r.status === 'waiting' || r.status === 'submitting').map((r) => r.jobId ?? r.id)
  const retries = recs.filter((r) => isRetry(r.label) && r.jobId)
  // every job Cloud saw, measured or (until it is) its estimate: the day budget holds exactly these, so the press's count matches it
  const spentCredits = Math.round(recs.filter((r) => r.jobId).reduce((s, r) => s + (r.costCredits ?? r.estimateCredits), 0) * 10) / 10
  return { jobIds, credits: sum(done), open, retried: retries.length > 0, retryCredits: retries.length ? sum(done.filter((r) => isRetry(r.label))) : null, spentCredits }
}

type Gate<T> = { ok: true; value: T } | { ok: false; errors: string[]; raw?: unknown }
/**
 * the first try, else the retry: the passing value, or the last errors. `soft` (Develop) is the gate's last word for an answer no
 * retry follows: a paragraph that still drops the idea's words passes with a left-out warning (the retry, else the first try)
 * rather than ending a paid press with nothing.
 */
function pick<T>(store: PlannerStore, runId: string, key: string, gate: (text: string) => Gate<T>, soft?: (text: string) => Gate<T>): { got: Gate<T> | null; attempts: number; raw?: unknown } {
  const t1 = store.text(runId, key)
  if (t1 === null) return { got: null, attempts: 0 }
  const c1 = gate(t1)
  if (c1.ok) return { got: c1, attempts: 1 }
  const t2 = store.text(runId, key, true)
  const last = (t: string, c: Gate<T>) => { const s = soft?.(t); return s?.ok ? s : c }
  if (t2 === null) { const g = last(t1, c1); return { got: g, attempts: 1, raw: g.ok ? undefined : c1.raw } }
  const c2 = gate(t2)
  if (c2.ok) return { got: c2, attempts: 2 }
  const g2 = last(t2, c2)
  const g = g2.ok ? g2 : last(t1, c2)
  return { got: g, attempts: 2, raw: g.ok ? undefined : (c2.raw ?? c1.raw) }
}

export function finalizeRun(store: PlannerStore, jobs: JobStore, intent: RunIntent): { status: number; body: PlannerResponse } {
  const { runId } = intent
  const rj = runJobs(jobs, runId)
  const base = { runId, jobIds: rj.jobIds, credits: rj.credits, spentCredits: rj.spentCredits, createdAt: intent.createdAt }
  if (intent.items.some((it) => store.text(runId, it.key) === null)) throw new PlannerError(409, 'the answers have not landed yet: recover the job by id (free), then ask again', { runId, jobIds: base.jobIds })
  let out: PlannerResponse
  let ok: boolean
  if (intent.kind === 'plan') {
    const prompts = intent.request.prompts as string[]
    // the scene brief's key light, when Build the set sent one, replaces the planner's own (the sentence words stay the fallback)
    const light = intent.request.light as PlanLight | undefined
    const scenes: PlannedScene[] = intent.items.map((it, i) => {
      const p = pick(store, runId, it.key, (t) => { const c = checkPlanText(t, prompts[i]); return c.ok ? { ok: true, value: withBriefLight(c.plan, light) } : c })
      const g = p.got!
      if (g.ok) { const f = finishPlan(g.value, prompts[i]); store.writePlan(runId, it.key, f.plan); return { prompt: prompts[i], plan: f.plan, repaired: false, notes: f.notes, errors: [], attempts: p.attempts } }
      const rep = repairChecked(p.raw)
      const f = rep ? finishPlan(withBriefLight(rep.plan, light), prompts[i]) : null
      if (rep && f) { rep.plan = f.plan; store.writePlan(runId, it.key, rep.plan) }
      return { prompt: prompts[i], plan: rep?.plan ?? null, repaired: !!rep, notes: [...(rep?.notes ?? []), ...(f?.notes ?? [])], errors: g.errors, attempts: p.attempts }
    })
    ok = scenes.some((s) => s.plan)
    out = { kind: 'plan', ...base, scenes } satisfies PlanResponse
  } else if (intent.kind === 'develop') {
    const idea = String(intent.request.idea), mode = intent.request.mode as DevelopMode
    const brief = (rule: 'gate' | 'warn') => (t: string): Gate<DevelopedBrief> => { const c = checkBriefText(t, idea, rule); return c.ok ? { ok: true, value: c.brief } : c }
    const p = pick(store, runId, intent.items[0].key, brief('gate'), brief('warn'))
    const g = p.got!
    ok = g.ok
    out = { kind: 'develop', ...base, mode, idea, brief: g.ok ? g.value : null, attempts: p.attempts, ...(g.ok ? {} : { errors: g.errors }) } satisfies DevelopResponse
  } else {
    const name = String(intent.request.name)
    const p = pick(store, runId, intent.items[0].key, (t) => { const c = checkFleshText(t, name); return c.ok ? { ok: true, value: c } : c })
    const g = p.got!
    ok = g.ok
    out = { kind: 'flesh', ...base, name, description: g.ok ? g.value.description : '', warnings: g.ok ? g.value.warnings : [], attempts: p.attempts,
      ...(g.ok ? {} : { errors: g.errors }) } satisfies FleshResponse
  }
  // the retry billed its own row: the response says so (for the price line), whether or not it fixed the answer
  if (rj.retried) { out.retried = true; out.retryCredits = rj.retryCredits }
  store.writeResult(out)
  return { status: ok ? 200 : 422, body: out }
}
