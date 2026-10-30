// The free face count in the still judge (plan-draw-from-master §4): flagged only when MORE faces are seen than people are staged
// in the frame; null (never an error) when Python or the model is missing or the run is refused. A fake runner writes the json.
import { existsSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { countFaces, faceDepsOf, type FaceDeps } from '../faceCount.ts'
import { judgeFor } from '../stillPasses.ts'
import type { RunPython } from '../colorMatch.ts'
import { redrawTake, STILL_ID } from './redrawRig.ts'

const box = { x: 1, y: 2, w: 3, h: 4, score: 0.9 }
const seeing = (n: number): RunPython => async (_py, args) => {
  writeFileSync(args[args.indexOf('--json') + 1], JSON.stringify({ seen: n, boxes: Array.from({ length: n }, () => box) }))
}
const refusing: RunPython = async () => { throw new Error('Python was not found') }
const deps = (run: RunPython, python: string | null = 'python'): FaceDeps => ({ appDir: process.cwd(), python: () => python ?? undefined, run })
const judge = (t: ReturnType<typeof redrawTake>, d?: FaceDeps) => judgeFor(t.pub, t.take.id, STILL_ID, d)

describe('the judge face count', () => {
  it('flags a still with more faces than staged people (3 seen where 2 are staged and on their mark)', async () => {
    const t = redrawTake({ withTom: true })
    const j = await judge(t, deps(seeing(3)))
    expect(j.faces).toEqual({ seen: 3, expected: 2, boxes: [box, box, box] })
    expect(j.people.map((p) => p.status)).toEqual(['ok', 'ok'])
    expect(j.flagged).toBe(true)
  })

  it('does not flag as many faces as people, nor fewer (0 seen where 2 are staged)', async () => {
    const t = redrawTake({ withTom: true })
    expect((await judge(t, deps(seeing(2)))).flagged).toBe(false)
    const none = await judge(t, deps(seeing(0)))
    expect(none.faces).toEqual({ seen: 0, expected: 2, boxes: [] })
    expect(none.flagged).toBe(false)
  })

  it('expects only the people in frame: a staged person off screen is not counted', async () => {
    const t = redrawTake() // tom is missing from the still: 'off', still counted; the count stays by who the ID pass shows
    const j = await judge(t, deps(seeing(2)))
    expect(j.faces!.expected).toBe(2)
  })

  it('faces is null, not an error, when the runner refuses, the script output is missing, or Python is not found', async () => {
    const t = redrawTake({ withTom: true })
    for (const d of [deps(refusing), deps(async () => {}), deps(seeing(1), null), undefined]) {
      const j = await judge(t, d)
      expect(j.faces ?? null).toBeNull()
      expect(j.flagged).toBe(false)
    }
  })

  it('faceDepsOf needs the app folder and a runner', () => {
    expect(faceDepsOf({ python: () => 'python', appDir: '/a' })).toBeUndefined()
    expect(faceDepsOf({ python: () => 'python', runPython: refusing, appDir: '/a' })).toBeDefined()
  })
})

describe('the face count sidecar', () => {
  it('goes to the OS temp dir, not beside the still, and is gone afterwards', async () => {
    const t = redrawTake(), seen: string[] = []
    const run: RunPython = async (_py, args) => { const j = args[args.indexOf('--json') + 1]; seen.push(j); writeFileSync(j, JSON.stringify({ seen: 1, boxes: [box] })) }
    const still = path.join(t.heroDir, `${STILL_ID}.png`)
    const d = { ...deps(run), appDir: path.resolve(__dirname, '..', '..', '..') }
    const r = await countFaces(d, still)
    if (r === null) return // no script or model on this machine: nothing ran, nothing to place
    expect(r.seen).toBe(1)
    expect(path.dirname(seen[0]).startsWith(os.tmpdir())).toBe(true)
    expect(path.dirname(seen[0])).not.toBe(t.heroDir)
    expect(existsSync(seen[0])).toBe(false)
  })
})
