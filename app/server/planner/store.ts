/**
 * Planner runs on disk, under public/lab-assets/planner/<runId>/:
 *   intent.json        written BEFORE the spend (kind, request, answer keys and user messages, seed, estimate): a restart
 *                      mid-job still knows what the billed answers were for
 *   <key>.txt          the model's answers as Cloud saved them (first try); <key>-retry.txt for the retry
 *   plan-<key>.json    a scene plan that passed parsePlan; this store re-checks every plan and refuses to write one that does not
 *   result.json        the route's response, once (GET /run?id= serves it, or completes it from the .txt files for free)
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { PlannerResponse } from '../../src/shared/bibleContract.ts'
import type { ScenePlan } from '../../src/stage3d/contract.ts'
import { parsePlan } from '../../src/stage3d/plan.ts'
import type { GenItem } from './gemma.ts'

export type RunKind = 'plan' | 'develop' | 'flesh'
export const RUN_ID_RE = /^pl-\d{14}-[a-z0-9]{4}$/

export interface RunIntent {
  runId: string
  kind: RunKind
  /** the request as accepted (prompts / idea + mode / name + description + scene) */
  request: Record<string, unknown>
  items: GenItem[]
  seed: number
  estimateCredits: number
  createdAt: string
}

export class PlannerError extends Error {
  readonly status: number
  readonly extra: Record<string, unknown>
  constructor(status: number, message: string, extra: Record<string, unknown> = {}) { super(message); this.status = status; this.extra = extra }
}

export const retryName = (key: string) => `${key}-retry`

export class PlannerStore {
  readonly root: string
  constructor(publicDir: string) { this.root = path.join(publicDir, 'lab-assets', 'planner') }

  newRunId(now: Date, rand: () => number = Math.random): string {
    const stamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
    for (;;) {
      const id = `pl-${stamp}-${Math.floor(rand() * 36 ** 4).toString(36).padStart(4, '0')}`
      if (!existsSync(path.join(this.root, id))) return id
    }
  }

  dir(runId: string): string {
    if (typeof runId !== 'string' || !RUN_ID_RE.test(runId)) throw new PlannerError(400, 'bad run id')
    return path.join(this.root, runId)
  }

  writeIntent(i: RunIntent): void {
    const d = this.dir(i.runId)
    mkdirSync(d, { recursive: true })
    writeFileSync(path.join(d, 'intent.json'), JSON.stringify(i, null, 2) + '\n', { flag: 'wx' })
  }
  readIntent(runId: string): RunIntent | null { return this.json(runId, 'intent.json') as RunIntent | null }
  /** a refusal before any spend: the run never happened */
  drop(runId: string): void { rmSync(this.dir(runId), { recursive: true, force: true }) }

  /** an answer as saved by the job (null = not landed) */
  text(runId: string, key: string, retry = false): string | null {
    const f = path.join(this.dir(runId), `${retry ? retryName(key) : key}.txt`)
    return existsSync(f) ? readFileSync(f, 'utf8') : null
  }

  /** THE plan guard: a plan reaches disk only when parsePlan accepts it */
  writePlan(runId: string, key: string, plan: ScenePlan): void {
    const r = parsePlan(plan, { corridor: true })
    if (!r.ok) throw new PlannerError(500, `refusing to write an invalid plan for ${key}: ${r.errors.slice(0, 3).join('; ')}`)
    writeFileSync(path.join(this.dir(runId), `plan-${key}.json`), JSON.stringify(r.plan, null, 2) + '\n')
  }

  writeResult(r: PlannerResponse): void {
    writeFileSync(path.join(this.dir(r.runId), 'result.json'), JSON.stringify(r, null, 2) + '\n')
  }
  readResult(runId: string): PlannerResponse | null { return this.json(runId, 'result.json') as PlannerResponse | null }

  private json(runId: string, name: string): unknown {
    const f = path.join(this.dir(runId), name)
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null
  }
}
