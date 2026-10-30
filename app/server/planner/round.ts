/**
 * The paid path for every planner call: one claim (409 while another planner call runs), the intent on disk BEFORE the spend,
 * ONE job for all answers (runJob: graph validated, day budget checked and committed, ledger row before the wait), then the
 * gate; answers that failed get ONE retry job that quotes the validator's errors back. A refusal before Cloud saw the job
 * (budget, invalid graph, no target) removes the intent: nothing was billed. Anything after the job exists keeps it, so the
 * run can be completed by id (POST /__lab/jobs/recover, then GET /run?id=) and is never resent.
 */
import { MASTER_KEY, isMasterLabel } from '../bible/masterDraw.ts'
import { HERO_KEY, isHeroLabel } from '../hero/spec.ts'
import { exclusive, isFreeRefusal, runJob, type JobRuntime } from '../jobs/index.ts'
import { isL2RLabel, L2R_KEY } from '../l2r/spec.ts'
import { checkBriefText, checkFleshText } from './briefCheck.ts'
import { finalizeRun, isPlannerLabel, runLabel } from './finalize.ts'
import { buildTextGraph, genFor, jobCredits, saveNode, type GenItem } from './gemma.ts'
import { checkPlanText, retryMessage } from './planText.ts'
import { PlannerError, retryName, type PlannerStore, type RunIntent } from './store.ts'

export const PLANNER_KEY = 'planner'

export interface PlannerCtx {
  store: PlannerStore
  runtime: () => JobRuntime
  /** the system prompt per kind (plan reads docs/stage3d-plan-prompt.md) */
  system: (kind: RunIntent['kind']) => string
}

/** the gate's verdict on one answer, for choosing what to retry (finalize.ts makes the response from disk) */
function failed(intent: RunIntent, key: string, text: string): string[] | null {
  const i = intent.items.findIndex((it) => it.key === key)
  const c = intent.kind === 'plan' ? checkPlanText(text, (intent.request.prompts as string[])[i])
    : intent.kind === 'develop' ? checkBriefText(text, String(intent.request.idea)) : checkFleshText(text, String(intent.request.name))
  return c.ok ? null : c.errors
}
const WHAT = { plan: 'plan', develop: 'brief', flesh: 'description' } as const

async function job(ctx: PlannerCtx, intent: RunIntent, items: GenItem[], retry: boolean): Promise<string> {
  const { store } = ctx
  const dir = store.dir(intent.runId)
  const label = runLabel(intent, retry)
  const est = jobCredits(items.length)
  const r = await runJob(ctx.runtime(), {
    graph: buildTextGraph({ items, system: ctx.system(intent.kind), gen: genFor(intent.kind), seed: intent.seed + (retry ? 7919 : 0), prefix: `canvas-stage/planner-${intent.runId}` }),
    label, estimateCredits: est, outputs: Object.fromEntries(items.map((it) => [saveNode(it.key), { dir, name: retry ? retryName(it.key) : it.key }])),
    note: `${label} (${items.length} answer${items.length > 1 ? 's' : ''}, ${est} cr estimated)`, timeoutMs: 15 * 60_000,
  })
  const lost = items.filter((it) => store.text(intent.runId, it.key, retry) === null)
  if (lost.length) throw new PlannerError(502, `job ${r.jobId} succeeded but ${lost.length} answer(s) did not land; recover it by id, do not resend`, { jobId: r.jobId, runId: intent.runId })
  return r.jobId
}

export async function runPlanner(ctx: PlannerCtx, intent: RunIntent) {
  const rt = ctx.runtime()
  return exclusive(PLANNER_KEY, `${WHAT[intent.kind]} (${intent.runId})`, rt.store, isPlannerLabel, async () => {
    ctx.store.writeIntent(intent)
    try { await job(ctx, intent, intent.items, false) } catch (e) {
      if (isFreeRefusal(e)) ctx.store.drop(intent.runId) // refused before the spend
      throw e
    }
    const retry: GenItem[] = []
    for (const it of intent.items) {
      const text = ctx.store.text(intent.runId, it.key)!
      const errors = failed(intent, it.key, text)
      if (errors) retry.push({ key: it.key, user: retryMessage(it.user, text, errors, WHAT[intent.kind]) })
    }
    let retryRefused: string | undefined
    if (retry.length) {
      try { await job(ctx, intent, retry, true) } catch (e) {
        // a retry the budget (or anything free) refused costs nothing: the first answers stand, plans fall back to repair
        if (isFreeRefusal(e)) retryRefused = e.message
        else throw e
      }
    }
    const out = finalizeRun(ctx.store, rt.store, intent)
    return retryRefused ? { ...out, body: { ...out.body, retryRefused } } : out
  }, [{ key: MASTER_KEY, match: isMasterLabel }, { key: HERO_KEY, match: isHeroLabel }, { key: L2R_KEY, match: isL2RLabel }])
}
