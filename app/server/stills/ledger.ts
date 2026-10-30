/**
 * Credit ledger for Stills jobs, same conventions and table as experiments/lib/ledger.ts (experiments/credit-log.md):
 * a `submitted` row with the job id is appended right after submit, before waiting, so a lost wait can be
 * recovered by id (experiments/recover-job.ts) — never by resubmitting. A completion row with status and cost
 * follows. Cost = drop in effective_balance_cents across the job, re-read after a settle delay; valid only if
 * nothing else ran on the account meanwhile. Server-side only; never logs or returns the API key.
 */
import { appendFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

export const CREDITS_PER_CENT = 2.11

/** Strip anything that looks like a Comfy API key from text bound for the browser or a log. */
export function redact(s: string): string {
  return s.replace(/comfyui-[A-Za-z0-9_-]+/g, 'comfyui-REDACTED')
}

export function creditsFor(cents: number | null): number | null {
  return cents === null ? null : Math.round(cents * CREDITS_PER_CENT)
}

export function centsDelta(before: number | null, after: number | null): number | null {
  return before !== null && after !== null ? Math.round((before - after) * 100) / 100 : null
}

export async function balanceCents(): Promise<number | null> {
  const key = process.env.COMFY_API_KEY
  if (!key || process.env.COMFY_BASE_URL) return null
  try {
    const r = await fetch('https://cloud.comfy.org/api/billing/balance', { headers: { 'X-API-Key': key, accept: 'application/json' } })
    if (!r.ok) return null
    const j = (await r.json()) as { effective_balance_cents?: number }
    return typeof j.effective_balance_cents === 'number' ? j.effective_balance_cents : null
  } catch {
    return null
  }
}

const cell = (s: string | number | null | undefined) => redact(String(s ?? '')).replace(/\|/g, '/').replace(/\s+/g, ' ')
const when = () => new Date().toISOString().slice(0, 16)

export interface Row {
  workflow: string
  jobId: string
  status: string
  wallSeconds?: number
  execSeconds?: number | null
  deltaCents?: number | null
  note: string
}

export function formatRow(r: Row, at = when()): string {
  const credits = r.deltaCents === undefined ? '' : creditsFor(r.deltaCents ?? null) ?? '?'
  const delta = r.deltaCents === undefined ? '' : r.deltaCents ?? '?'
  const exec = r.status === 'submitted' ? '' : r.execSeconds ?? '?'
  return `| ${at} | STILLS | ${cell(r.workflow)} | ${cell(r.jobId)} | ${cell(r.status)} | ${r.wallSeconds ?? ''} | ${exec} | ${delta} | ${credits} | ${cell(r.note)} |`
}

export async function logRow(logPath: string, r: Row): Promise<void> {
  if (!existsSync(logPath)) {
    await appendFile(logPath,
      '# Credit log — Comfy Cloud jobs run by experiment tracks\n\n' +
      '| when (UTC) | experiment | workflow | job id | status | wall s | exec s | Δ cents | ≈ credits | note |\n' +
      '|---|---|---|---|---|---|---|---|---|---|\n')
  }
  await appendFile(logPath, formatRow(r) + '\n')
}
