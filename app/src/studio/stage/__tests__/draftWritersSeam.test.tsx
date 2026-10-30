// @vitest-environment jsdom
// The writers of one scene draft on the Stage: a words-drawer edit, a person pick (Use this look, personLook.ts) and a Stage-made
// prop placed (stageProp.ts), all through the Stage's one design copy (StageScene.tsx), against one fake draft route that keeps a
// revision and refuses a stale write with 409, as the server does. In any order, or all at once: no refusal, and the words, the
// person and the prop's tile are all kept. The stand-in (and so its build) goes in only once the server's draft holds the tile.
// A refused save is said in plain words. Nothing is drawn or spent.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KitWorld } from '../../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import type { DraftDesign } from '../../../shared/sceneContract'
import { fakeApi, WORLD } from '../../scene/__tests__/fakes'
import { briefApi } from '../../scene/briefApi'
import { castCard, freshGuided } from '../../scene/design/guided'
import type { Piece } from '../../scene/design/model'
import { freshDesign, type Design } from '../../scene/design/state'
import { SAVE_MS } from '../../scene/design/useDesign'
import { setPieceBuildApi } from '../pieceBuilding'
import { PromptDrawer, resetDrawerChoice } from '../PromptDrawer'
import { takeLook } from '../scene/personLook'
import { StageSceneProvider, useStageScene, type KitIo, type StageScene } from '../scene/StageScene'
import { placeStageProp, stagePropDesign } from '../stageProp'

const SCENE = 'sc-test-writers'
const BRIEF = 'A small kitchen at dawn. The cook lifts a kettle.'
const LOOK = '/lab-assets/cast/cook-a1/draft/cand-2.png'
const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
const LAB = { kit: { id: WORLD, world: null } } as unknown as ProjectionLabState

/** the draft, cast-keep and project routes in memory: one revision, a stale write refused with 409 (server/scene draft) */
function draftServer(design: Design) {
  let rec = { design: design as unknown as DraftDesign, revision: 1, updatedAt: 't' }
  const refused: number[] = []
  const o = { fail: null as null | 'stale' | 'disk' }
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {}
    if (url.startsWith('/__lab/scene/draft?project=')) return ok({ draft: rec })
    if (url === '/__lab/scene/draft' && init?.method === 'POST') {
      if (o.fail === 'disk') return ok({ error: 'the disk is full' }, 500)
      if (o.fail === 'stale' || body.revision !== rec.revision) { refused.push(body.revision as number); return ok({ error: 'This scene was changed in another tab or window. Reload to see it.', revision: rec.revision }, 409) }
      rec = { design: body.design as DraftDesign, revision: rec.revision + 1, updatedAt: 't' }
      return ok({ draft: rec })
    }
    if (url === '/__lab/cast/keep') return ok({ url: `/lab-assets/cast/${body.cardId}/kept/face-1.png` })
    if (url.includes('/ingredient')) return ok({})
    return ok({ error: 'no' }, 404)
  })
  return { f, o, refused, now: () => rec.design as unknown as Design }
}

const kitIo = (): KitIo => ({
  get: vi.fn(async (id: string) => ({ id, perf: { path: [[0, 0], [2, 0]] } }) as unknown as KitWorld),
  savePerf: vi.fn(async (id: string, p: KitWorld['perf']) => ({ id, perf: p }) as unknown as KitWorld),
}) as unknown as KitIo

let srv: ReturnType<typeof draftServer>
let cur: StageScene | null = null
const card = { ...castCard('Cook', 'person', 'a tall cook in a white apron'), cands: ['/lab-assets/cast/cook-a1/draft/cand-1.png', LOOK] }
beforeEach(() => {
  resetDrawerChoice(); localStorage.clear(); cur = null
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1080 })
  srv = draftServer({ ...freshDesign(), screen: 'board', phase: 'board', brief: BRIEF, guided: freshGuided([card]), pieces: [] })
  setPieceBuildApi({ get: vi.fn(async () => ({ price: 8, tiles: [], running: null, setChangedAt: null, stillStale: false })), build: vi.fn(), recover: vi.fn(), complete: vi.fn() })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 404 }))) // no project (no saved cast cards)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setPieceBuildApi(null); localStorage.clear() })

/** the newest design the provider published, as the rail reads it */
function Probe() {
  const st = useStageScene()
  useEffect(() => { cur = st })
  return null
}

async function mount() {
  const bible = fakeApi()
  render(
    <StageSceneProvider scene={SCENE} worldId={WORLD} lab={LAB} deps={{ api: briefApi(srv.f as never, SCENE), bible: bible.api, kit: kitIo() }}>
      <PromptDrawer /><Probe />
    </StageSceneProvider>)
  await screen.findByTestId('stage-brief-card')
  await waitFor(() => expect(cur?.x.s.synced).toBe(true))
  if (!screen.queryByTestId('stage-brief-input')) fireEvent.click(screen.getByTestId('stage-brief-view'))
  await screen.findByTestId('stage-brief-input')
  // what the stand-in and the build saw of the server's draft when they ran
  const seen: { place?: string[]; build?: string[] } = {}
  const tagsNow = () => srv.now().pieces.map((p: Piece) => p.tag)
  const deps = {
    design: stagePropDesign(() => cur, { poll: 20 }),
    bible: bible.api,
    place: vi.fn(async () => { seen.place = tagsNow(); return true }),
    build: vi.fn(() => { seen.build = tagsNow() }),
  }
  const ops = {
    edit: async () => {
      fireEvent.change(screen.getByTestId('stage-brief-input'), { target: { value: `${cur!.x.s.ref.current.brief} Steam rises.` } })
    },
    pick: () => takeLook(cur!, WORLD, card.id, LOOK),
    place: () => placeStageProp(deps, { world: { id: WORLD, plan: { kit: [] } }, name: 'Kettle', look: '/l/kettle.png', desc: 'a copper kettle', at: [1, 2], elementTags: [] }),
  }
  return { deps, seen, ops }
}
const settle = () => act(() => new Promise((r) => setTimeout(r, SAVE_MS + 150)))

describe('a drawer edit, a person pick and a prop placement: one design, one draft', () => {
  it.each([
    ['edit, pick, place', ['edit', 'pick', 'place']],
    ['place, edit, pick', ['place', 'edit', 'pick']],
    ['pick, place, edit', ['pick', 'place', 'edit']],
    ['all at once', null],
  ] as const)('%s: no refusal; the words, the person and the tile all kept; the stand-in and the build only after the tile is saved', async (_, order) => {
    const { deps, seen, ops } = await mount()
    if (order) for (const k of order) await ops[k]()
    else await Promise.all([ops.place(), ops.edit(), ops.pick()])
    await settle(); await settle()
    expect(srv.refused).toEqual([])
    expect(screen.queryByTestId('drawer-save-error')).toBeNull()
    expect(srv.now().brief).toBe('A small kitchen at dawn. @cook lifts a kettle. Steam rises.')
    const tags = srv.now().pieces.map((p: Piece) => p.tag).sort()
    expect(tags).toEqual(['cook', 'kettle'])
    expect(srv.now().pieces.find((p: Piece) => p.tag === 'cook')).toMatchObject({ type: 'person', state: 'approved' })
    expect(srv.now().pieces.find((p: Piece) => p.tag === 'kettle')).toMatchObject({ type: 'prop', state: 'approved', looks: ['/l/kettle.png'] })
    expect(srv.now().brief).not.toMatch(/@kettle/) // no tag appended to the words
    expect(deps.place).toHaveBeenCalledWith('crates', [1, 2], 'Kettle', 'prop:kettle')
    expect(seen.place).toContain('kettle') // the server's draft held the tile when the stand-in went in
    expect(seen.build).toContain('kettle')
  }, 20_000)

  it('a save another tab refused: said as another tab, the tile out, nothing placed', async () => {
    const { deps, ops } = await mount()
    srv.o.fail = 'stale'
    let err: unknown
    await ops.place().catch((e: unknown) => { err = e })
    expect(String(err)).toMatch(/another tab/)
    expect(deps.place).not.toHaveBeenCalled()
    expect(deps.build).not.toHaveBeenCalled()
    await waitFor(() => expect(cur!.x.s.ref.current.pieces.some((p) => p.tag === 'kettle')).toBe(false))
  }, 20_000)

  it('a save that failed: plain words ending "try again", never the another-tab line, nothing placed', async () => {
    const { deps, ops } = await mount()
    srv.o.fail = 'disk'
    let err: unknown
    await ops.place().catch((e: unknown) => { err = e })
    expect(String(err)).toMatch(/the disk is full, try again$/)
    expect(String(err)).not.toMatch(/another tab/)
    expect(deps.place).not.toHaveBeenCalled()
  }, 20_000)

  it('a stale draft write (another tab got there first) is said in plain words with a Reload, and the stale page stops writing', async () => {
    const { ops } = await mount()
    const writes = () => srv.f.mock.calls.filter(([u, i]) => u === '/__lab/scene/draft' && (i as RequestInit | undefined)?.method === 'POST').length
    srv.o.fail = 'stale'
    await ops.edit(); await settle()
    await waitFor(() => expect(screen.getByTestId('drawer-save-error').textContent).toMatch(/another tab/))
    expect(screen.getByTestId('drawer-save-error').textContent).toContain('Reload')
    const tries = writes()
    expect(tries).toBeGreaterThan(0)
    await ops.edit(); await settle()
    expect(writes()).toBe(tries) // the stale page writes nothing more over the other tab's draft
  }, 20_000)
})
