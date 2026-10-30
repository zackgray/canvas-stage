// Wave A fix (F4): Blocking and the Set's lane line never assume the cast member's gender. Every word the user can read in these
// files (comments stripped; strings and JSX text kept) is free of he / she / his / her / him and their kin.
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(process.cwd(), 'src/studio')
const BLOCKING = join(SRC, 'stage/panels/blocking')
const FILES = [
  ...readdirSync(BLOCKING).filter((f) => /\.tsx?$/.test(f)).map((f) => join(BLOCKING, f)),
  ...['laneAdvice.ts', 'SetPlace.tsx', 'MarkHandle.tsx', 'MarkFacing.tsx'].map((f) => join(SRC, 'scene', f)),
]
const GENDERED = /\b(he|she|his|her|hers|him|himself|herself)\b/i
/** the file without its comments: what is left is code, strings and JSX text */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1').replace(/\{\s*\}/g, '')

describe('Blocking and lane copy is neutral', () => {
  it('scans the files it means to (a moved folder would pass vacuously)', () => {
    expect(FILES.length).toBeGreaterThan(15)
  })
  it.each(FILES.map((f) => [f.slice(SRC.length + 1), f]))('%s has no gendered word outside comments', (_name, file) => {
    const hits = code(readFileSync(file, 'utf8')).split('\n').filter((l) => GENDERED.test(l))
    expect(hits).toEqual([])
  })
})
