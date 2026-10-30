// Test fakes for the Scene screen: an in-memory Bible server (no Cloud, the paid draw is a mock), a lab that lands on the
// world the kit build writes, a Cast state, and free kit build deps.
import { vi } from 'vitest'
import type { BankShot } from '../../../labs/projection/engine/manifest'
import type { Cast } from '../castCards'
import type { CardPayload, Ingredient } from '../../../project/model'
import type { BibleMaster, BibleRecord, BibleResponse } from '../../../shared/bibleContract'
import { BATTLEFIELD } from '../../../stage3d/presets'
import type { KitBuildDeps } from '../../kit/useKitBuild'
import { checkDesign, validElement } from '../../../../server/bible/validate'
import { BibleRequestError, type BibleApi } from '../bibleApi'

export const WORLD = 'loc-2026-10-25T09-00-00-000'
export type { Cast }

export const blank = (worldId: string): BibleRecord => ({
  worldId, version: 0, prompt: '', master: null, candidates: [], lighting: '', materials: '', elements: [], extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't',
})
const master = (n: number, seed: number): BibleMaster => ({
  id: `m${n}`, png: `/lab-assets/locations/${WORLD}/bible/master/m${n}.png`, madeBy: 'qwen-image-2512+depth', seed, depthStrength: 0.9, jobId: `job-${n}`, credits: 14, createdAt: 't',
})

/**
 * A Bible server in memory: every write is the next version; drawMaster is the mocked paid job (two candidates). Elements and the
 * free check go through the server's own validator, so the fake refuses what the real route refuses (a cast tile with no card).
 */
export const SET_KEY = 'aaaa0001'
export function fakeApi(start: BibleRecord | null = null, running: BibleResponse['running'] = null, o: { approved?: boolean; setKey?: string | null } = {}) {
  let b = start
  // (guided wave) the set's approval, as the server reports it beside the sheet: approved at the set's key unless a test says not
  let setKey = o.setKey === undefined ? SET_KEY : o.setKey
  let setApproval: BibleResponse['setApproval'] = o.approved === false ? null : { key: SET_KEY, at: 't' }
  const beside = () => ({ setApproval, setKey })
  let drawn = 0
  const next = (f: (x: BibleRecord) => Partial<BibleRecord>, worldId: string): BibleResponse => {
    const cur = b ?? blank(worldId)
    b = { ...cur, ...f(cur), version: cur.version + 1 }
    return { bible: b, running: null }
  }
  const api = {
    get: vi.fn(async (_worldId?: string): Promise<BibleResponse> => ({ bible: b, running, ...beside() })),
    save: vi.fn(async (r) => next(() => ({ prompt: r.prompt ?? b?.prompt ?? '', lighting: r.lighting ?? b?.lighting ?? '', materials: r.materials ?? b?.materials ?? '' }), r.worldId)),
    drawMaster: vi.fn(async (r) => next((x) => ({ candidates: [...x.candidates, ...Array.from({ length: r.count ?? 2 }, () => master(++drawn, 100 + drawn))] }), r.worldId)),
    approve: vi.fn(async (r) => next((x) => ({ master: x.candidates.find((m) => m.id === r.masterId) ?? null }), r.worldId)),
    approveSet: vi.fn(async (_worldId: string) => { setApproval = { key: setKey ?? SET_KEY, at: 'now' }; return { bible: b, running: null, ...beside() } }),
    putElement: vi.fn(async (r) => {
      try { validElement(r.element) } catch (e) { throw new BibleRequestError((e as Error).message, 400) }
      return next((x) => ({ elements: [...x.elements.filter((e) => e.tag !== r.element.tag), r.element] }), r.worldId)
    }),
    check: vi.fn(async (r: Parameters<BibleApi['check']>[0]) => { const errors = checkDesign(r); return { ok: !errors.length, errors } }),
    removeElement: vi.fn(async (r) => next((x) => ({ elements: x.elements.filter((e) => e.tag !== r.tag) }), r.worldId)),
    recover: vi.fn(async (_jobId: string) => {}),
  } satisfies BibleApi
  /** a piece moved: the set's key is another, so the approval reads stale */
  const moveSet = () => { setKey = 'bbbb0002' }
  return { api, current: () => b, moveSet }
}

export const kitShot = { id: WORLD, image: `/lab-assets/locations/${WORLD}/still.png`, width: 1920, height: 1088, prompt: 'd', seed: 23, depths: [], kind: 'kit', manifest: '/lab-assets/locations/manifest.json' } as unknown as BankShot
const world = { id: WORLD, description: 'd', plan: BATTLEFIELD, perf: { path: [[0, -12], [0, -8]] as [number, number][] }, still: null, createdAt: '' }

export function kitDeps(): KitBuildDeps {
  return { create: vi.fn(async () => world), still: vi.fn(async () => new Blob(['png'])), upload: vi.fn(async () => ({ ...world, still: '/s.png' })) }
}

export const rosa: Ingredient<CardPayload> = {
  id: 'rosa', kind: 'cast', name: 'Rosa', versions: [{ version: 1, created: 't', payload: { name: 'Rosa', description: 'a stocky woman in a waxed jacket', references: [], sheets: ['/cast/rosa/front.png'] } }],
} as unknown as Ingredient<CardPayload>

export function fakeCast(over: Partial<Cast> = {}): Cast {
  return { cards: [], ...over }
}

