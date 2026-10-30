// Atomic writes: a write that dies before its rename leaves the stored project whole and no temp file behind.
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import * as fsp from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { project } from '../../../src/project/__tests__/fixture.ts'
import { ProjectStore } from '../store.ts'

vi.mock('node:fs/promises', async (orig) => {
  const real = await orig<typeof fsp>()
  return { ...real, rename: vi.fn(real.rename) }
})

describe('ProjectStore', () => {
  it('writes through a temp file and a rename; a failed rename keeps the old document', async () => {
    const store = new ProjectStore(path.join(mkdtempSync(path.join(tmpdir(), 'project-store-')), 'public'))
    const saved = await store.save({ ...project(), revision: 0 })
    const file = store.file('test')
    expect(vi.mocked(fsp.rename)).toHaveBeenCalledWith(expect.stringMatching(/project\.json\.\d+\.\d+\.tmp$/), file)
    const before = readFileSync(file, 'utf8')

    vi.mocked(fsp.rename).mockRejectedValueOnce(new Error('disk gone'))
    await expect(store.save({ ...saved, name: 'half' })).rejects.toThrow('disk gone')
    expect(readFileSync(file, 'utf8')).toBe(before)
    expect(readdirSync(path.dirname(file))).toEqual(['project.json'])

    // the lock is released after a failure: the next save goes through
    expect(await store.save({ ...saved, name: 'whole' })).toMatchObject({ revision: 2, name: 'whole' })
  })

  it('refuses ids that would leave the projects folder', () => {
    const store = new ProjectStore(path.join(tmpdir(), 'public'))
    for (const id of ['..', '../x', 'a/b', 'a\\b', '', '.x']) expect(() => store.file(id), id).toThrow(/bad project id/)
  })
})
