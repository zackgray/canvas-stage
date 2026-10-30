// @vitest-environment jsdom
// Join (T3b): the engine outlives a scene switch, so scene B's Shoot used to open with A's unlocked take on the deck and save it
// under B's key (over B's own unlocked take), and offer to lock it onto B's set. Now A's take stays A's: B's Shoot drops it from
// the deck, puts B's own back, never writes A's under B, and A gets its take back on return. The real scene store and lock block.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OperatorEngine } from '../../labs/controller/engine/engine'
import { fakeTake } from '../../labs/projection/clay/__fixtures__/take'
import { STAGE_RIGS } from '../../labs/projection/operator/link'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import type { LibraryApi } from '../../library/api'
import { openScene, resetCurrentScene, useCurrentScene } from '../../library/currentScene'
import { resetSceneJobs } from '../../jobs/sceneJobs'
import type { SceneView } from '../../shared/libraryContract'
import { resetCurrentTake } from './currentTake'
import { resetClayStore } from './takeClay'
import { TakeLockBlock } from './TakeLockBlock'
import { saveUnlocked } from './unlockedTake'
import { resetLockedTakes } from './worldTakes'

const A = 'sc-20261025090000-aaaa', B = 'sc-20261025110000-bbbb'
const WORLD: Record<string, string> = { [A]: 'loc-a', [B]: 'loc-b' }
const KEY = (s: string) => `canvas-stage:unlocked-take:${s}`
const view = (id: string): SceneView => {
  const summary = { id, name: id, thumbnail: null, stage: 'shoot' as const, lastEdited: 't', hidden: false, revision: 1 }
  return { ...summary, createdAt: 't', updatedAt: 't', worldId: WORLD[id], worlds: [{ id: WORLD[id], builtAt: 't', brief: null }], summary, facts: { setBuilt: true, briefChanged: false, takes: {} } }
}
const library = { get: vi.fn(async (id: string) => view(id)) } as unknown as LibraryApi
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })

function labOn(source: string, engine: OperatorEngine) {
  return { op: { mode: 'operator', setMode: vi.fn(), note: null, engine }, stage: null, s: { source },
    performance: { layer: { pack: { id: 'pack-a', fps: 24, frames: 400 } }, listed: true, packs: [], selected: 'pack-a' } } as unknown as ProjectionLabState
}
/** one lab whose engine survives the switch; the scene's Shoot mounted afresh per scene; the set follows the scene a beat late */
function Studio({ engine }: { engine: OperatorEngine }) {
  const sc = useCurrentScene()
  const [source, setSource] = useState('loc-a')
  useEffect(() => { if (sc.view) setSource(sc.view.worldId!) }, [sc.view])
  if (!sc.id || !sc.view) return <p>Opening</p>
  return <div key={sc.id}><TakeLockBlock lab={labOn(source, engine)} /></div>
}
const samples = (s: string) => (JSON.parse(localStorage.getItem(KEY(s)) ?? 'null') as { raw: { samples: unknown[] } } | null)?.raw.samples.length ?? null
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 300)) })

beforeEach(() => {
  resetCurrentScene(library); resetSceneJobs(); resetCurrentTake(); resetLockedTakes(); resetClayStore(); localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url)
    if (u.startsWith('/__lab/takes')) return json({ takes: [] })
    if (u.startsWith('/__lab/clay')) return json({ clay: null })
    if (/^\/__lab\/scenes\/[^/]+\/jobs$/.test(u)) return json({ jobs: [] })
    return json({ error: `no route ${u}` }, 404)
  }))
})
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); resetSceneJobs(); resetCurrentTake(); resetLockedTakes(); resetClayStore(); resetCurrentScene() })

describe('an unlocked take stays with its scene', () => {
  it("A's take in the camera's memory is not saved under B, not shown or lockable in B, and comes back in A", async () => {
    const engine = new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false })
    saveUnlocked(B, 'loc-b', fakeTake(3)) // B's own unlocked take, kept from an earlier visit
    const bOwn = samples(B)
    act(() => openScene(A))
    render(<Studio engine={engine} />)
    act(() => { engine.deck.take = fakeTake(5) }) // recorded in A, not locked
    await screen.findByTestId('take-lock-btn')
    await waitFor(() => expect(samples(A)).toBe(fakeTake(5).raw.samples.length))

    act(() => openScene(B))
    await settle()
    expect(samples(B)).toBe(bOwn) // B's own copy is not overwritten by A's take
    expect(engine.deck.take?.raw.samples.length).toBe(bOwn) // B's own take is the one on the deck
    expect(samples(A)).toBe(fakeTake(5).raw.samples.length)

    act(() => openScene(A))
    await settle()
    expect(engine.deck.take?.raw.samples.length).toBe(fakeTake(5).raw.samples.length) // A's take is back in A
    expect(samples(B)).toBe(bOwn)
  })

  it('with nothing kept for B, B opens with an empty deck: no Lock button for A\'s take', async () => {
    const engine = new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false })
    act(() => openScene(A))
    render(<Studio engine={engine} />)
    act(() => { engine.deck.take = fakeTake(5) })
    await screen.findByTestId('take-lock-btn')
    act(() => openScene(B))
    await settle()
    expect(engine.deck.take).toBeNull()
    expect(screen.queryByTestId('take-lock-btn')).toBeNull()
    expect(localStorage.getItem(KEY(B))).toBeNull()
  })
})
