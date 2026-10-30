// The planner over a temp public dir and the job runner's fake Cloud: each submitted job answers from a queue of canned model
// outputs (one string per answer key), so the gate, the retry and the money path run with no network and no credits.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Job } from '@comfyorg/sdk'
import { permissiveInfo, rig as jobRig } from '../../jobs/__tests__/rig.ts'
import type { ApiGraph } from '../../comfy/index.ts'
import { plannerSnapshot } from '../gemma.ts'
import { plannerCtx } from '../plugin.ts'
import { handlePlanner } from '../routes.ts'

/** a valid compact plan answer (the prompt doc's Example 1, compact as the note asks) */
export const GOOD_PLAN = `{"seed":17,"groundShade":0.3,"puddles":15,"fog":{"color":"#7d7f84","density":0.018},"light":{"fill":1.3,"key":1.0,"keyDir":[140,10]},"sky":{"gain":1.05,"cutDeg":10},"kit":[
{"kind":"treeline","args":[160,3,10],"at":[0,-65]},
{"kind":"hut","args":[5,6,5],"at":[-9,-22],"yawDeg":20},
{"kind":"fire","args":[7,1.5],"at":[-9,-22.5],"lift":0.9},
{"kind":"debris","args":[8,6],"at":[-6.5,-20]}
]}`
/** fence length 99 (outside 1..40): what E132's two retries fixed */
export const BAD_PLAN = GOOD_PLAN.replace('{"kind":"treeline","args":[160,3,10],"at":[0,-65]}', '{"kind":"fence","args":[99,3,0.4],"at":[-9,-14]}')
/** an unknown kind and a piece in the corridor: repairPlan drops / moves them */
export const UGLY_PLAN = GOOD_PLAN.replace('{"kind":"treeline","args":[160,3,10],"at":[0,-65]}', '{"kind":"spaceship","args":[1],"at":[0,-10]}')

/** a valid full brief answer */
export const BRIEF = {
  brief: 'Dusk on a churned battlefield. @soldier walks toward us through the smoke, past a burning @cart.',
  elements: [
    { name: 'The soldier', tag: 'soldier', type: 'person', look: 'a young man in a dented helmet and a mud-caked gambeson', supported: true },
    { name: 'Cart', tag: 'cart', type: 'prop', look: 'a tipped two-wheeled cart on fire', supported: true },
  ],
  lighting: 'Low dusk sun from behind, orange fire glow on the left.', materials: 'Wet mud, charred wood, dull steel.',
  background: 'soldiers fighting and running in the smoke far behind him',
  beats: ['He walks out of the smoke.', 'He passes the burning cart.', 'He stops and looks back.'], warnings: [],
}

export type Sent = { json: ApiGraph }
export type Answers = Record<string, string>

export function setup(o: { cap?: number | null; configured?: boolean; download?: boolean } = {}) {
  const pub = path.join(mkdtempSync(path.join(tmpdir(), 'planner-')), 'public')
  const jobs = jobRig({ cap: o.cap === undefined ? 100 : o.cap })
  const answers: Answers[] = []
  const submitted: Sent[] = []
  let n = 0
  const job = (a: Answers): Job => ({
    id: `aaaaaaaa-0000-4000-8000-0000000009${String(++n).padStart(2, '0')}`, status: 'succeeded', metrics: { execution_ms: 6000 }, wait: async () => {},
    getOutputs: (node: string) => (node.startsWith('s_') ? [{ name: 'answer_00001_.txt', toFile: async (p: string) => { if (o.download === false) throw new Error('download failed'); writeFileSync(p, a[node.slice(2)] ?? '') } }] : []),
  }) as unknown as Job
  const rt = jobs.restart({
    submit: async (wf) => { jobs.submits++; submitted.push(wf as unknown as Sent); return job(answers.shift() ?? {}) },
    fetchInfo: async () => permissiveInfo(plannerSnapshot()),
  })
  const ctx = plannerCtx({}, { publicDir: pub, runtime: () => rt, now: () => new Date('2026-10-24T09:00:00Z'), seed: () => 500, configured: () => o.configured !== false })
  const call = (sub: string, body: unknown) => handlePlanner(ctx, 'POST', sub, new URLSearchParams(), body)
  const get = (sub = '', q: Record<string, string> = {}) => handlePlanner(ctx, 'GET', sub, new URLSearchParams(q), null)
  /** the user message the n-th job sent for an answer key */
  const userOf = (i: number, key: string) => String(submitted[i].json[`g_${key}`].inputs.prompt)
  return { pub, jobs, rt, ctx, answers, submitted, call, get, userOf }
}
