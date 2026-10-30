// Vitest globalSetup: the suite must never write the real credit ledger. A rig that mounts a plugin with the real app
// root and forgets to inject a temp ledger appends fake rows to app/experiments/credit-log.md (Wave 2 review, M1);
// this reads the file before the run and fails the run if a test wrote to it. Rows the fake Cloud writes carry its job ids
// (`…-0000-4000-8000-0000…`); rows from a real job (experiments or a dev server billing while the suite runs) do not, and
// are reported, never failed on. Never `git checkout` the ledger to clear this: while experiments run that erases paid rows.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const LEDGER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'experiments', 'credit-log.md')

export const fingerprint = (file: string) =>
  existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : 'absent'

/** a row the fake Cloud wrote: its job ids are all-zero-padded test uuids */
export const FAKE_ROW = /\b[0-9a-f]{8}-0000-4000-8000-0000\w*/

/** What changed between two ledger texts: `test` = a test's rows (fail), `live` = rows from real jobs only (report), null = none. */
export function ledgerChange(before: string | null, after: string | null): { kind: 'test' | 'live' | 'rewritten'; rows: string[] } | null {
  if (before === after) return null
  if (before === null || after === null || !after.startsWith(before)) return { kind: 'rewritten', rows: [] }
  const rows = after.slice(before.length).split('\n').filter((l) => l.trim())
  return { kind: rows.some((l) => FAKE_ROW.test(l)) ? 'test' : 'live', rows }
}

export default function setup() {
  const read = () => (existsSync(LEDGER) ? readFileSync(LEDGER, 'utf8') : null)
  const before = read()
  return () => {
    const change = ledgerChange(before, read())
    if (!change) return
    if (change.kind === 'live') {
      console.warn(`ledger guard: ${change.rows.length} row(s) from real jobs were added to ${LEDGER} during the run (paid experiments or a dev server ` +
        'billing). Not a test leak; leave them.')
      return
    }
    throw new Error(`ledger guard: the test run ${change.kind === 'test' ? 'wrote fake-Cloud rows to' : 'rewrote'} the real credit ledger (${LEDGER}). ` +
      'Inject a temp ledger path into the rig that wrote it. Remove only the fake rows by hand: do NOT `git checkout` the file, ' +
      'paid experiment rows written meanwhile would be lost.')
  }
}
