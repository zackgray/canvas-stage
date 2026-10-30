// A mocked planner / piece client for the Scene design tests: nothing reaches Cloud; every paid call is a vi.fn to count.
import { vi } from 'vitest'
import { BATTLEFIELD } from '../../../stage3d/presets'
import type { DevelopResponse, PlannerStatus, PlanResponse, SceneBrief } from '../../../shared/bibleContract'
import type { BriefApi } from '../briefApi'

export const IDEA = 'a fantasy scene where Robin Hood runs through the forest while knights on horses chase him, evening sun behind them'

export const BRIEF: SceneBrief = {
  brief: 'A chase through a dense green forest at evening. @robin, the outlaw, runs through the trees while @knights on horses chase him, led by @sirguy.',
  elements: [
    { name: 'Robin Hood', tag: 'robin', type: 'person', look: 'lean outlaw in green wool and worn leather', supported: true },
    { name: 'The knights', tag: 'knights', type: 'group', look: 'knights on horses in dull plate', supported: false },
    { name: 'Sir Guy', tag: 'sirguy', type: 'person', look: 'a hard-faced knight in black mail', supported: true },
  ],
  lighting: 'Evening sun low behind the chasers, rim-lit edges, fog glowing amber.',
  materials: 'Green wool, worn leather, moss on bark, wet leaves.',
  background: 'more riders crashing through the far trees',
  beats: ['Robin runs.', 'The knights close in.', 'He vanishes into the fog.'],
  warnings: [{ element: 'The knights', issue: 'mounted figures and horses are not supported', swap: 'the same figure on foot' }],
}

const run = { runId: 'r1', jobIds: ['j1'], credits: 3, createdAt: 't', attempts: 1 }

export function fakeBrief(o: { draft?: Record<string, unknown> | null; moved?: Record<string, string>; developed?: SceneBrief; budget?: PlannerStatus['budget'] } = {}) {
  let n = 0
  /** the server's draft as the fake keeps it */
  const store = { draft: o.draft ?? null as Record<string, unknown> | null }
  const api = {
    plan: vi.fn(async (r: { prompts: string[] }): Promise<PlanResponse> => ({ ...run, kind: 'plan', scenes: r.prompts.map((prompt) => ({ prompt, plan: BATTLEFIELD, repaired: false, notes: [], errors: [], attempts: 1 })) })),
    develop: vi.fn(async (r: { idea: string; mode: 'light' | 'full' }): Promise<DevelopResponse> => ({ ...run, kind: 'develop', mode: r.mode, idea: r.idea, brief: o.developed ?? null })),
    status: vi.fn(async (): Promise<PlannerStatus> => ({ prices: { single: 4, cold: 3, perItem: 1, retry: '' }, running: null, unrecovered: [], budget: o.budget ?? { cap: 500, remaining: 500 } })),
    candidates: vi.fn(async (r: { type: string; count: number }) => ({ urls: Array.from({ length: r.count }, () => `/lab-assets/test/${r.type}-${++n}.png`) })),
    uploadReference: vi.fn(async (f: File) => `/lab-assets/test/upload-${f.name}`),
    loadDraft: vi.fn(async () => store.draft),
    saveDraft: vi.fn(async (d: Record<string, unknown>) => { store.draft = JSON.parse(JSON.stringify(d)) as Record<string, unknown> }),
    // the real route copies and removes nothing (wave 3 M1): the draft stays until New scene clears it
    migrateDraft: vi.fn(async (_worldId: string) => o.moved ?? {}),
    recoverConcept: vi.fn(async (_jobId: string, runId: string) => ({ urls: [`/lab-assets/scene/default/concepts/${runId}/c-1.png`] })),
    saveCard: vi.fn(async (_r: { cardId: string; name: string; description: string; face: string }) => {}),
    store,
  } satisfies BriefApi & { store: unknown }
  return api
}
export type FakeBrief = ReturnType<typeof fakeBrief>

/** every paid call made so far */
export const paidCalls = (b: FakeBrief) => b.plan.mock.calls.length + b.candidates.mock.calls.length + b.develop.mock.calls.length
