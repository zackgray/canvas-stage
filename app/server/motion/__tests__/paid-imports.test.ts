/**
 * The generator is free: made moves run on the owner's own motion computer, so the plugin must never touch the paid
 * machinery (docs/plan-kimodo-live.md 1.2). This guards the whole server/motion folder against importing it.
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PAID_IMPORT = /from\s+['"](\.\.\/)+(comfy|jobs|stills|budget)|from\s+['"][^'"]*(priceBasis|ledger|budget)/

describe('labMotion imports nothing paid', () => {
  it('no source file imports the Comfy / jobs / budget modules', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.ts'))
    expect(files.length).toBeGreaterThan(3)
    for (const f of files) {
      expect(readFileSync(path.join(DIR, f), 'utf8'), f).not.toMatch(PAID_IMPORT)
    }
  })
})
