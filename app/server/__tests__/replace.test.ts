import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// rename always refused as on Windows while the dev server holds the target open (EPERM, 2026-10-21)
vi.mock('node:fs/promises', async (orig) => {
  const real = await orig<typeof import('node:fs/promises')>()
  return { ...real, rename: vi.fn(async () => { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }) }) }
})
vi.mock('node:fs', async (orig) => {
  const real = await orig<typeof import('node:fs')>()
  return { ...real, renameSync: vi.fn(() => { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }) }) }
})

const { replaceFile, replaceFileSync } = await import('../replace.ts')

describe('replaceFile on a locked target', () => {
  afterEach(() => vi.clearAllMocks())
  const setup = () => {
    const d = mkdtempSync(path.join(tmpdir(), 'replace-'))
    const dest = path.join(d, 'manifest.json'), tmp = `${dest}.tmp`
    writeFileSync(dest, '{"old":true}'); writeFileSync(tmp, '{"new":true}')
    return { dest, tmp }
  }
  it('async: falls back to an in-place copy and removes the temp file', async () => {
    const { dest, tmp } = setup()
    await replaceFile(tmp, dest)
    expect(readFileSync(dest, 'utf8')).toBe('{"new":true}')
    expect(existsSync(tmp)).toBe(false)
  })
  it('sync: same', () => {
    const { dest, tmp } = setup()
    replaceFileSync(tmp, dest)
    expect(readFileSync(dest, 'utf8')).toBe('{"new":true}')
    expect(existsSync(tmp)).toBe(false)
  })
})
