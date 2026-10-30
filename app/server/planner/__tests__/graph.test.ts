// The planner graph: E132's proven settings, the workflow snapshot kept in step (rewrite it with
// `npx tsx -e "import('./server/planner/gemma.ts').then(m=>require('fs').writeFileSync('workflows/planner_gemma4-e4b.api.json', JSON.stringify(m.plannerSnapshot(), null, 1)+'\n'))"`),
// and the graph checked against the cached Cloud object_info when this checkout has one.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { validateGraph } from '../../../experiments/lib/validate.ts'
import type { ObjectInfo } from '../../comfy/index.ts'
import { buildTextGraph, jobCredits, plannerSnapshot } from '../gemma.ts'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const INFO = path.join(APP, 'experiments', 'cache', 'object_info.json')

describe('the planner graph', () => {
  it('workflows/planner_gemma4-e4b.api.json is what the builder makes', () => {
    expect(JSON.parse(readFileSync(path.join(APP, 'workflows', 'planner_gemma4-e4b.api.json'), 'utf8'))).toEqual(plannerSnapshot())
  })
  it('N answers share one loader and one system prompt; seeds step; 1..8 answers', () => {
    const g = buildTextGraph({ items: [{ key: 'p0', user: 'a' }, { key: 'p1', user: 'b' }], system: 'S', seed: 10, prefix: 'x' })
    expect(Object.values(g).filter((n) => n.class_type === 'CLIPLoader')).toHaveLength(1)
    expect([g.g_p0.inputs['sampling_mode.seed'], g.g_p1.inputs['sampling_mode.seed']]).toEqual([10, 11])
    expect(g.s_p1.inputs).toMatchObject({ text: ['g_p1', 0], format: 'txt' })
    expect(() => buildTextGraph({ items: [], system: 'S', seed: 1, prefix: 'x' })).toThrow()
    expect(() => buildTextGraph({ items: [{ key: 'Bad Key', user: 'a' }], system: 'S', seed: 1, prefix: 'x' })).toThrow()
    expect([jobCredits(1), jobCredits(8)]).toEqual([4, 11])
  })
  it.skipIf(!existsSync(INFO))('validates against the cached Cloud object_info', () => {
    const info = JSON.parse(readFileSync(INFO, 'utf8')) as ObjectInfo
    expect(validateGraph(plannerSnapshot(), info).filter((e) => !/COMFY_MATCHTYPE_V3/.test(e))).toEqual([])
  })
})
