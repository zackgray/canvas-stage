import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KIT_ARGS, KIT_PIECES } from '../kit.ts'
import { parsePlan } from '../plan.ts'

const doc = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'docs', 'stage3d-plan-prompt.md'), 'utf8')

describe('docs/stage3d-plan-prompt.md', () => {
  it('lists every kit kind with its arg names in the catalogue', () => {
    for (const kind of Object.keys(KIT_PIECES)) {
      const line = doc.split(/\r?\n/).find((l) => l.startsWith(`- ${kind}:`))
      expect(line, `catalogue line for ${kind}`).toBeTruthy()
      for (const a of KIT_ARGS[kind]) expect(line, `${kind} arg ${a.name}`).toContain(a.name)
    }
  })
  it('every worked example parses', () => {
    const blocks = [...doc.matchAll(/```json\r?\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]))
    expect(blocks.length).toBeGreaterThanOrEqual(2)
    for (const b of blocks) { const r = parsePlan(b); expect(r.ok ? [] : r.errors).toEqual([]) }
  })
})
