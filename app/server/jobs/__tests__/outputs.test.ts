// A downloaded output appears under its final name only whole (fix 2026-10-30): the hero listing announces a still as soon as its
// png exists, so a png streamed straight to its final name was served half-written and the page kept the cut-off picture.
import { appendFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Job } from '@comfyorg/sdk'
import { describe, expect, it } from 'vitest'
import { downloadOutputs, partOf, saveWhole } from '../outputs.ts'

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'cs-outputs-'))

/** an output that streams in two halves; `during` runs between them, when the old code had a half file under the final name */
const twoHalves = (during: () => void, fail = false) => ({
  name: 'out.png',
  toFile: async (p: string) => {
    writeFileSync(p, 'TOP-HALF')
    await new Promise((r) => setTimeout(r, 5))
    during()
    if (fail) throw new Error('socket hang up')
    appendFileSync(p, '+BOTTOM-HALF')
  },
})

describe('saveWhole / downloadOutputs', () => {
  it('the final name does not exist while the bytes stream, then holds them all; no part file is left', async () => {
    const dir = tmp(), file = path.join(dir, 'hero-1.png')
    const seen: boolean[] = []
    await saveWhole(twoHalves(() => seen.push(existsSync(file))), file)
    expect(seen).toEqual([false])
    expect(readFileSync(file, 'utf8')).toBe('TOP-HALF+BOTTOM-HALF')
    expect(existsSync(partOf(file))).toBe(false)
  })

  it('a download that breaks halfway leaves neither the final name nor a part file', async () => {
    const dir = tmp(), file = path.join(dir, 'hero-1.png')
    await expect(saveWhole(twoHalves(() => {}, true), file)).rejects.toThrow(/hang up/)
    expect(readdirSync(dir)).toEqual([])
  })

  it('downloadOutputs lands each output whole under its target name, and says where', async () => {
    const dir = tmp(), seen: boolean[] = []
    const job = { getOutputs: () => [twoHalves(() => seen.push(existsSync(path.join(dir, 'hero-2.png'))))] } as unknown as Job
    const r = await downloadOutputs(job, { o_1: { dir, name: 'hero-2' } })
    expect(r).toEqual({ saved: [path.join(dir, 'hero-2.png')], failed: [] })
    expect(seen).toEqual([false])
    expect(readFileSync(path.join(dir, 'hero-2.png'), 'utf8')).toBe('TOP-HALF+BOTTOM-HALF')
    expect(readdirSync(dir)).toEqual(['hero-2.png'])
  })

  it('the part name is in the same folder and is never a png a listing or shots/ would take', () => {
    const p = partOf(path.join('a', 'b', 'hero-1.png'))
    expect(path.dirname(p)).toBe(path.join('a', 'b'))
    expect(p.endsWith('.png')).toBe(false)
  })
})
