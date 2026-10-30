// The hero listing's picture URLs carry their file's version (fix 2026-10-30), so a page never keeps a cut-off or older copy.
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { HeroStill } from '../../../src/shared/shotContract.ts'
import { serveShot } from '../../takes/serveShots.ts'
import { versionedPng } from '../pngVersion.ts'
import { heroJob, mount, TAKE, world } from './rig.ts'

describe('versionedPng', () => {
  const pub = mkdtempSync(path.join(os.tmpdir(), 'cs-pngv-'))
  const url = '/lab-assets/shots/take-x/hero/hero-1.png'
  const file = path.join(pub, url)
  mkdirSync(path.dirname(file), { recursive: true })

  it('adds ?v=<size>-<mtime>, and the version moves when the bytes do', () => {
    writeFileSync(file, 'TOP'); utimesSync(file, 1000, 1000)
    const a = versionedPng(pub, url)
    expect(a).toBe(`${url}?v=3-1000000`)
    writeFileSync(file, 'TOP+BOTTOM'); utimesSync(file, 1000, 1000)
    expect(versionedPng(pub, url)).not.toBe(a)
  })
  it('leaves a missing file, an already-versioned URL and an empty one as they are', () => {
    expect(versionedPng(pub, '/lab-assets/shots/take-x/hero/none.png')).toBe('/lab-assets/shots/take-x/hero/none.png')
    expect(versionedPng(pub, `${url}?v=1`)).toBe(`${url}?v=1`)
    expect(versionedPng(pub, '')).toBe('')
  })
  it('the versioned URL serves the same file (the query is ignored on read)', () => {
    let served = false
    const res = { setHeader: () => {}, end: () => { served = true } }
    expect(serveShot({ method: 'GET' } as never, res as never, pub, versionedPng(pub, url).replace('/lab-assets/shots', ''))).toBe(true)
    expect(served).toBe(true)
  })
})

describe('GET /__lab/hero', () => {
  it('lists each still with a versioned picture URL', async () => {
    const w = world(); const m = mount(w, w.runtime())
    w.queue.push(heroJob('aaaaaaaa-0000-4000-8000-000000000890'))
    expect((await m.render()).status).toBe(200)
    const stills = (await m.list()).body.stills as HeroStill[]
    expect(stills).toHaveLength(1)
    expect(stills[0].png).toMatch(new RegExp(`^/lab-assets/shots/${TAKE}/hero/${stills[0].id}\\.png\\?v=\\d+-\\d+$`))
  })
})
