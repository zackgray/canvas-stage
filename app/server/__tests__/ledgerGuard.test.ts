// m18: the ledger guard tells a test's fake-Cloud rows (fail the run) from real jobs' rows written meanwhile (report, never "git checkout").
import { describe, expect, it } from 'vitest'
import { ledgerChange } from './ledger-guard.ts'

const head = '| at | JOB | wf | id | status |\n'
const row = (id: string) => `| 2026-10-23 | JOB | hero-still take-1 | ${id} | submitted | | | | | note |\n`

describe('ledger guard', () => {
  it('no change, a test row, a real row, a rewrite', () => {
    expect(ledgerChange(head, head)).toBeNull()
    expect(ledgerChange(head, head + row('aaaaaaaa-0000-4000-8000-000000000801'))).toMatchObject({ kind: 'test' })
    expect(ledgerChange(head, head + row('bbbbbbbb-1111-4222-8333-444444444444'))).toEqual({ kind: 'live', rows: [row('bbbbbbbb-1111-4222-8333-444444444444').trim()] })
    expect(ledgerChange(head + row('x'), head)).toMatchObject({ kind: 'rewritten' })
  })
})
