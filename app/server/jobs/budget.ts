/**
 * Per-day credit budget, persisted (budget.json) so a restart does not reset it. The estimate is committed BEFORE
 * submit and corrected to the measured cost when it settles (or handed back when nothing was billed). Unmeasured costs
 * stay at their estimate: the budget errs toward refusing. The day is the machine's local date.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { JobError } from './types.ts'

interface State { day: string; committedCredits: number }

/** CANVAS_DAY_BUDGET -> credits, or null when unset / not a positive number. */
export function parseCap(v: string | undefined): number | null {
  const n = Number((v ?? '').trim())
  return v && Number.isFinite(n) && n > 0 ? n : null
}

export class Budget {
  private readonly file: string
  readonly cap: () => number | null
  private readonly today: () => string
  constructor(file: string, cap: () => number | null, today: () => string = () => new Date().toLocaleDateString('sv')) {
    this.file = file
    this.cap = cap
    this.today = today
  }

  private read(): State {
    const day = this.today()
    try {
      const s = JSON.parse(readFileSync(this.file, 'utf8')) as State
      if (s.day === day && Number.isFinite(s.committedCredits)) return s
    } catch { /* missing or torn: a new day / a fresh start */ }
    return { day, committedCredits: 0 }
  }

  private write(s: State): void {
    mkdirSync(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(s, null, 2) + '\n')
    renameSync(tmp, this.file)
  }

  spentToday(): number { return this.read().committedCredits }

  /** Throws a 429 JobError unless spent-today + estimate fits the cap (and refuses when no cap is set). */
  check(estimate: number): void {
    const cap = this.cap()
    if (cap === null) throw new JobError('unconfigured', "Today's spending limit isn't set, so nothing paid can run. Set it as described in SETUP and restart the app.", 503)
    const spent = this.read().committedCredits
    if (spent + estimate > cap) {
      throw new JobError('budget', `Day budget reached: ${spent.toFixed(1)} of ${cap} credits spent today, this job needs about ${estimate} more. Raise the daily spending limit (see SETUP) and restart the app to continue.`, 429)
    }
  }

  /** Add (or, negative, hand back) credits against today. */
  adjust(credits: number): void {
    const s = this.read()
    s.committedCredits = Math.max(0, Math.round((s.committedCredits + credits) * 100) / 100)
    this.write(s)
  }
}
