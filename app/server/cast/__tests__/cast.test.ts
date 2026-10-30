import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ApiGraph } from '../../comfy/index.ts'
import { frontGraph, SNAPSHOT_FRONT } from '../graphs.ts'
import { VIEW_PROMPTS, frontPrompt } from '../prompts.ts'
import { DESC, post, setup } from './cast-rig.ts'

const J = (n: string) => JSON.parse(readFileSync(path.join(import.meta.dirname, '../../../workflows', n), 'utf8')) as ApiGraph

describe('cast graphs', () => {
  it('front: Z-Image Turbo, 9 steps CFG 1, one saved candidate per seed, never the 40-step Qwen-Image T2I', () => {
    const g = frontGraph('p', [11, 12, 13])
    const text = JSON.stringify(g)
    expect(text).toContain('z_image_turbo_bf16')
    expect(text).not.toContain('qwen_image_2512')
    const ks = Object.values(g).filter((n) => n.class_type === 'KSampler')
    expect(ks.map((k) => [k.inputs.seed, k.inputs.steps, k.inputs.cfg])).toEqual([[11, 9, 1], [12, 9, 1], [13, 9, 1]])
    expect(Object.keys(g).filter((k) => /^s\d$/.test(k))).toEqual(['s0', 's1', 's2'])
  })

  it('the hands prompt counters the oversized fists (E33) and the front prompt carries the contest rules', () => {
    expect(VIEW_PROMPTS.hands).toMatch(/fist about the size of the face and no bigger/)
    const p = frontPrompt(DESC)
    expect(frontPrompt(DESC, 'my rules')).toContain('my rules')
  })

  it('workflows/cast_front_zit.api.json is the snapshot of the builder', () => {
    expect(J('cast_front_zit.api.json')).toEqual(SNAPSHOT_FRONT())
  })
})

describe('cast endpoint', () => {
  it('candidates: one job, the estimate is what the budget refuses on, files land in the draft', async () => {
    const low = setup(2) // 3 candidates ~ 3 cr > 2 cr cap
    expect((await post(low.cast, 'candidates', { cardId: 'rosa', description: DESC })).status).toBe(429)
    expect(low.t.submits).toBe(0)
    const { t, cast, dir } = setup()
    const r = await post(cast, 'candidates', { cardId: 'rosa', description: DESC })
    expect(r.status).toBe(200)
    expect(t.submits).toBe(1)
    expect((r.body as { candidates: string[] }).candidates).toEqual([1, 2, 3].map((i) => `/lab-assets/cast/rosa/draft/cand-${i}.png`))
    for (const i of [1, 2, 3]) expect(existsSync(path.join(dir('rosa', 'draft'), `cand-${i}.png`))).toBe(true)
  })

  it('refuses without spending: masks, short description, bad ids, bad counts, no budget, unknown route', async () => {
    const { t, cast } = setup()
    const refused = async (route: string, body: Record<string, unknown>, status: number, re?: RegExp) => {
      const r = await post(cast, route, body)
      expect(r.status).toBe(status)
      if (re) expect((r.body as { error: string }).error).toMatch(re)
    }
    await refused('candidates', { cardId: 'rosa', description: 'tall' }, 400, /describe/)
    await refused('candidates', { cardId: '../x', description: DESC }, 400, /card id/)
    await refused('candidates', { cardId: 'rosa', description: DESC, count: 9 }, 400, /count/)
    await refused('nope', {}, 404)
    await refused('views', { cardId: 'rosa', pick: 1 }, 404) // the sheet routes are gone: Scene only draws fronts and keeps faces
    expect(t.submits).toBe(0)
    const none = setup(null) // no CANVAS_DAY_BUDGET: the runner refuses, nothing spent
    expect((await post(none.cast, 'candidates', { cardId: 'rosa', description: DESC })).status).toBe(503)
    expect(none.t.submits).toBe(0)
  })

  it('a second paid click while a job runs is refused as busy', async () => {
    const { cast, pub } = setup()
    mkdirSync(path.join(pub, 'lab-assets', 'cast', 'rosa', 'draft'), { recursive: true })
    const a = post(cast, 'candidates', { cardId: 'rosa', description: DESC })
    const b = await post(cast, 'candidates', { cardId: 'rosa', description: DESC })
    expect(b.status).toBe(409)
    expect((await a).status).toBe(200)
  })
})
