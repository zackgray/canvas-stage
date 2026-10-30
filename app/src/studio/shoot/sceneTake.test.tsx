// @vitest-environment jsdom
// M-1 (scene library review): the current take belongs to the scene's world. Work in scene A (its take current, a draw left
// unfinished), open scene B's Shoot: none of A's take shows, no button acts on it, and B's newest take is restored. The real
// scene store, take store, lock block and hero block; the set follows the scene a beat late, as the studio's own default does
// (a parent effect after the screen's), so B's Shoot first mounts on A's set.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
import type { HeroStill, TakeRecord } from '../../shared/shotContract'
import { currentTakeId, resetCurrentTake } from './currentTake'
import { HeroStillBlock } from './HeroStillBlock'
import { resetClayStore } from './takeClay'
import { STILL_PREVIEW_ROUTE } from '../../shared/stillPressContract'
import { TakeLockBlock } from './TakeLockBlock'
import { resetLockedTakes } from './worldTakes'

const A = 'sc-20261025090000-aaaa', B = 'sc-20261025110000-bbbb'
const WORLD: Record<string, string> = { [A]: 'loc-a', [B]: 'loc-b' }
const view = (id: string): SceneView => {
  const summary = { id, name: id, thumbnail: null, stage: 'shoot' as const, lastEdited: 't', hidden: false, revision: 1 }
  return { ...summary, createdAt: 't', updatedAt: 't', worldId: WORLD[id], worlds: [{ id: WORLD[id], builtAt: 't', brief: null }], summary, facts: { setBuilt: true, briefChanged: false, takes: {} } }
}
const library = { get: vi.fn(async (id: string) => view(id)) } as unknown as LibraryApi
const rec = (id: string, worldId: string, lockedAt: string): TakeRecord => ({ id, worldId, packId: 'pack-a', fps: 24, frames: 49, samples: [], focal: 35,
  viewAspect: 16 / 9, perfStart: 0, startKey: `k-${id}`, lockedAt, createdAt: lockedAt })
// A's take is the newest on disk, so nothing but the world can keep it out of B
const disk = [rec('take-a', 'loc-a', '2026-10-25T12:00:00.000Z'), rec('take-b', 'loc-b', '2026-10-25T10:00:00.000Z')]
const still = (id: string, takeId: string): HeroStill => ({ id, takeId, startKey: `k-${takeId}`, png: `/x/${id}.png`, seed: 7, jobId: 'j', credits: 1, approved: false, createdAt: 't' })
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
const posts: { url: string; body: Record<string, unknown> }[] = []
const heroReads: string[] = []
/** the hero posts that act on a take (the free press preview reads a take while its own scene is open, so it is not one) */
const paidHero = () => posts.filter((p) => p.url.startsWith('/__lab/hero') && p.url !== STILL_PREVIEW_ROUTE)

function serve() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (init?.method === 'POST') { posts.push({ url: u, body: JSON.parse(String(init.body ?? '{}')) }); return json({ still: still('fin', 'x') }) }
    if (u.startsWith('/__lab/takes')) return json({ takes: disk })
    if (u.startsWith('/__lab/clay')) return json({ clay: null })
    if (u.startsWith('/__lab/hero?')) {
      const take = new URL(u, 'http://x').searchParams.get('take')!
      heroReads.push(take)
      return json({ stills: [still(`hero-${take}`, take)], opening: { present: true, startKey: `k-${take}` }, running: null, unrecovered: [],
        unfinished: [{ id: `draw-${take}`, role: 'opening', frame: 0, png: '/x/d.png', createdAt: 't', startKey: `k-${take}` }] })
    }
    if (/^\/__lab\/scenes\/[^/]+\/jobs$/.test(u)) return json({ jobs: [] })
    return json({ error: `no route ${u}` }, 404)
  }))
}

function labOn(source: string, engine: OperatorEngine) {
  return { op: { mode: 'operator', setMode: vi.fn(), note: null, engine }, stage: null, s: { source },
    performance: { layer: { pack: { id: 'pack-a', fps: 24, frames: 400 } }, listed: true, packs: [], selected: 'pack-a' } } as unknown as ProjectionLabState
}
/** the studio: one lab (its engine survives the switch), the scene's Shoot mounted afresh per scene, the set following the scene late */
function Studio({ engine }: { engine: OperatorEngine }) {
  const sc = useCurrentScene()
  const [source, setSource] = useState('loc-a')
  useEffect(() => { if (sc.view) setSource(sc.view.worldId!) }, [sc.view])
  if (!sc.id || !sc.view) return <p>Opening</p>
  const lab = labOn(source, engine)
  return <div key={sc.id}><TakeLockBlock lab={lab} /><HeroStillBlock lab={lab} kit capture={async () => new Blob(['x'])} /></div>
}

beforeEach(() => { resetCurrentScene(library); resetSceneJobs(); resetCurrentTake(); resetLockedTakes(); resetClayStore(); posts.length = 0; heroReads.length = 0; serve() })
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); resetSceneJobs(); resetCurrentTake(); resetLockedTakes(); resetClayStore(); resetCurrentScene() })

async function inA(engine: OperatorEngine) {
  act(() => openScene(A))
  const v = render(<Studio engine={engine} />)
  await screen.findByTestId('hero-still-hero-take-a') // A's take is current, its unfinished draw offers a Finish
  expect(screen.getByTestId('hero-finish')).toBeTruthy()
  expect(currentTakeId()).toBe('take-a')
  return v
}

describe('the current take stays with its scene (M-1)', () => {
  it('lock in A, open B\'s Shoot: none of A\'s take shows, B\'s newest is restored, and the paid Finish carries B\'s take', async () => {
    const engine = new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false })
    await inA(engine)
    act(() => openScene(B))
    await screen.findByTestId('hero-still-hero-take-b')
    expect(currentTakeId()).toBe('take-b')
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(screen.queryByTestId('hero-still-hero-take-a')).toBeNull()
    expect(screen.queryByTestId('hero-approve-hero-take-a')).toBeNull()
    expect(screen.queryByTestId('hero-blocked')?.textContent ?? '').not.toMatch(/loc-/)
    fireEvent.click(await screen.findByTestId('hero-finish'))
    await waitFor(() => expect(posts.some((p) => p.url === '/__lab/hero/finish')).toBe(true))
    expect(paidHero().map((p) => p.body.takeId)).toEqual(['take-b']) // never A's take
  })

  it('with a take still in the camera\'s memory from A, B\'s Shoot says "Lock a take first": no still, no Finish of A\'s take', async () => {
    const engine = new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false })
    await inA(engine)
    engine.deck.take = fakeTake(2) // A's recording, still on the shared deck
    act(() => openScene(B))
    await screen.findByTestId('hero-no-take')
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(currentTakeId()).toBeNull()
    expect(screen.queryByTestId('hero-still-hero-take-a')).toBeNull()
    expect(screen.queryByTestId('hero-finish')).toBeNull()
    expect(paidHero()).toEqual([])
  })
})
