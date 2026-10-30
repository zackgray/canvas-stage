/**
 * Ledger rows for runner jobs: the same table and columns as every other endpoint (experiments/credit-log.md), tag
 * `JOB`. A `submitted` row with the job id is appended right after submit, before waiting; a completion row follows
 * after the settle delay. Text is redacted so a Comfy key can never reach the log.
 */
import { existsSync } from 'node:fs'
import { appendFile } from 'node:fs/promises'
import { creditsFor, redact, type Row } from '../stills/ledger.ts'

const cell = (s: string | number | null | undefined) => redact(String(s ?? '')).replace(/\|/g, '/').replace(/\s+/g, ' ')

export function formatJobRow(r: Row, at = new Date().toISOString().slice(0, 16)): string {
  const settled = r.deltaCents !== undefined
  const delta = settled ? r.deltaCents ?? '?' : ''
  const credits = settled ? creditsFor(r.deltaCents ?? null) ?? '?' : ''
  const exec = r.status === 'submitted' ? '' : r.execSeconds ?? '?'
  return `| ${at} | JOB | ${cell(r.workflow)} | ${cell(r.jobId)} | ${cell(r.status)} | ${r.wallSeconds ?? ''} | ${exec} | ${delta} | ${credits} | ${cell(r.note)} |`
}

export async function logJobRow(logPath: string, r: Row): Promise<void> {
  if (!existsSync(logPath)) {
    await appendFile(logPath,
      '# Credit log — Comfy Cloud jobs run by experiment tracks\n\n' +
      '| when (UTC) | experiment | workflow | job id | status | wall s | exec s | Δ cents | ≈ credits | note |\n' +
      '|---|---|---|---|---|---|---|---|---|---|\n')
  }
  await appendFile(logPath, formatJobRow(r) + '\n')
}
