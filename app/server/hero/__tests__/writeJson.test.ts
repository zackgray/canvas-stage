// writeJson (the pass candidates', stills' and intents' one writer) lands while a reader holds the file open: on Windows a bare
// rename over an open file is refused (EPERM), which once left a billed face pass 'running' on disk (the faceKeepJoin flake).
import { closeSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeJson } from '../store.ts'

describe('writeJson', () => {
  it('replaces a file a reader holds open at that instant (the page polling it)', async () => {
    const f = path.join(mkdtempSync(path.join(tmpdir(), 'wj-')), 'c.json')
    writeFileSync(f, JSON.stringify({ state: 'running' }))
    const fd = openSync(f, 'r')
    const done = writeJson(f, { state: 'candidate' })
    setTimeout(() => closeSync(fd), 30) // the reader lets go while the write retries
    await done
    expect(JSON.parse(readFileSync(f, 'utf8'))).toEqual({ state: 'candidate' })
  })
})
