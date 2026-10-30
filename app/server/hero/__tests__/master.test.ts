// The Bible master's draw (for A1's POST /__lab/bible/master): the same depth-locked Qwen graph, one job, the master view's
// depth as the patch's input, 1..2 candidates landing where A1 asks. Fake Cloud: no network, no credits.
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { drawMasterCandidates, masterCredits } from '../master.ts'
import { kitInfo, pngJob, stillPng, zdepthPng } from './kitRig.ts'
import { world } from './rig.ts'

describe('drawMasterCandidates', () => {
  it('two seeds in one Qwen job on the master view\'s depth; both land; priced 18 cr each (billed 17–18)', async () => {
    const w = world()
    w.queue.push(pngJob('aaaaaaaa-0000-4000-8000-000000000b01', stillPng()))
    const rt = w.runtime({ fetchInfo: async () => kitInfo() })
    const dir = mkdtempSync(path.join(tmpdir(), 'master-')), z = path.join(dir, 'z.png')
    writeFileSync(z, zdepthPng())
    const out = path.join(dir, 'master')
    const r = await drawMasterCandidates(rt, { zdepthFile: z, prompt: 'A cold dawn', picks: [{ seed: 1, name: 'm-a' }, { seed: 2, name: 'm-b' }], outDir: out, label: 'bible-master loc-x m-a m-b', depthStrength: 0.9 })
    expect(w.jobs.submits).toBe(1)
    const sent = (w.submitted[0] as { json: Record<string, { class_type: string; inputs: Record<string, unknown> }> }).json
    expect(Object.values(sent).filter((n) => n.class_type === 'KSampler').map((n) => n.inputs.seed)).toEqual([1, 2])
    expect(sent.cn.inputs.strength).toBe(0.9)
    expect(r).toMatchObject({ madeBy: 'qwen-image-2512+union-depth', depthStrength: 0.9 })
    expect(r.files.every((f) => existsSync(f))).toBe(true)
    expect(existsSync(path.join(out, 'master-depth.png'))).toBe(true)
    expect(masterCredits(2)).toBe(36)
    await expect(drawMasterCandidates(rt, { zdepthFile: z, prompt: 'p', picks: [], outDir: out, label: 'x' })).rejects.toMatchObject({ status: 400 })
  })
})
