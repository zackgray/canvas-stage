// @vitest-environment jsdom
// Use this look shows that it worked (who-plays-shown, owner dry-run 2026-10-29): the chain ran on the server but the card stayed
// open and the right panel kept its generic 'Who plays them' card, so nothing said the person was picked. In the real call order:
// the card opens on a world nobody plays, a picked look, Use this look, the world's performance re-read (as KIT_CHANGED does) ->
// the card closes, the panel's Who plays them names the person with the picked face; reopened, the press reads '✓ In use'.
// A refusal keeps the card open with a plain sentence. Fakes only; nothing spends.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SceneJobs } from '../../../../jobs/sceneJobs'
import type { KitWorld } from '../../../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../../../labs/projection/useProjectionLab'
import type { DraftDesign } from '../../../../shared/sceneContract'
import { fakeApi, WORLD } from '../../../scene/__tests__/fakes'
import { briefApi } from '../../../scene/briefApi'
import { castCard, freshGuided } from '../../../scene/design/guided'
import { freshDesign, type Design } from '../../../scene/design/state'
import { PersonCard } from '../../panels/PersonLook'
import { WhoPlays } from '../../panels/WhoPlays'
import { setPieceBuildApi } from '../../pieceBuilding'
import { StageSceneProvider, type KitIo } from '../StageScene'

const SCENE = 'sc-test-who-plays'
const CANDS = ['/lab-assets/cast/cook-a1/draft/cand-1.png', '/lab-assets/cast/cook-a1/draft/cand-2.png']
const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
const LAB = { kit: { id: WORLD, world: null } } as unknown as ProjectionLabState

function routes(design: Design) {
  let rec = { design: design as unknown as DraftDesign, revision: 1, updatedAt: 't' }
  return vi.fn(async (url: string, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {}
    if (url.startsWith('/__lab/scene/draft?project=')) return ok({ draft: rec })
    if (url === '/__lab/scene/draft' && init?.method === 'POST') {
      if (body.revision !== rec.revision) return ok({ error: 'Another tab changed this scene.', revision: rec.revision }, 409)
      rec = { design: body.design as DraftDesign, revision: rec.revision + 1, updatedAt: 't' }
      return ok({ draft: rec })
    }
    if (url === '/__lab/cast/keep') return ok({ url: `/lab-assets/cast/${body.cardId}/kept/face-1.png` })
    if (url.includes('/ingredient')) return ok({})
    return ok({ error: 'no' }, 404)
  })
}

/** the Stage's wiring in small: the world as the lab holds it, re-read after a performance save, the card and the panel's card */
function Host({ io, start, onClose }: { io: KitIo; start: KitWorld; onClose: () => void }) {
  const [w, setW] = useState(start)
  const [open, setOpen] = useState(true)
  const kit: KitIo = { get: io.get, savePerf: async (id, p) => { const r = await io.savePerf(id, p); setW(await io.get(id)); return r } }
  return (
    <StageSceneProvider scene={SCENE} worldId={WORLD} lab={LAB} deps={{ api: briefApi(f as never, SCENE), bible: bible.api, jobs, kit }}>
      <WhoPlays castId={w.perf.castId} onOpenCard={() => setOpen(true)} />
      {open && <PersonCard world={w} onClose={() => { onClose(); setOpen(false) }} />}
    </StageSceneProvider>
  )
}

let f: ReturnType<typeof routes>, bible: ReturnType<typeof fakeApi>, jobs: SceneJobs
beforeEach(() => {
  localStorage.clear()
  jobs = new SceneJobs(null)
  bible = fakeApi()
  setPieceBuildApi({ get: vi.fn(async () => ({ price: 8, tiles: [], running: null, setChangedAt: null, stillStale: false })), build: vi.fn(), recover: vi.fn(), complete: vi.fn() })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 404 }))) // no project: the new card is not in the library yet
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setPieceBuildApi(null); localStorage.clear() })

function kitIo(fail = false) {
  let perf = { path: [[0, 0], [2, 0]] } as unknown as KitWorld['perf']
  return {
    get: vi.fn(async (id: string) => ({ id, perf }) as unknown as KitWorld),
    savePerf: vi.fn(async (id: string, p: KitWorld['perf']) => {
      if (fail) throw new Error('the world is not answering')
      perf = p; return { id, perf: p } as unknown as KitWorld
    }),
  } as unknown as KitIo
}

const start = { id: WORLD, perf: { path: [[0, 0], [2, 0]] } } as unknown as KitWorld
const design = (): Design => ({ ...freshDesign(), screen: 'board', phase: 'board', brief: 'A kitchen. The cook lifts a kettle.', pieces: [],
  guided: freshGuided([{ ...castCard('Cook', 'person', 'a tall cook in a white apron and wooden clogs'), cands: [...CANDS] }]) })

describe('Use this look shows who plays them', () => {
  it('the card closes and the panel names them with the picked face; reopened, the press reads In use', async () => {
    f = routes(design())
    const closed = vi.fn()
    render(<Host io={kitIo()} start={start} onClose={closed} />)
    expect(screen.getByTestId('person-who-nobody')).toBeTruthy()
    fireEvent.click(await screen.findByTestId('look-cand-1'))
    fireEvent.click(screen.getByTestId('look-use'))
    await waitFor(() => expect(closed).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('object-card')).toBeNull()
    expect(screen.getByTestId('person-who-name').textContent).toBe('Cook')
    expect(screen.getByTestId('person-who-look-wait')).toBeTruthy() // the picked face (jsdom never loads the picture)
    expect(screen.queryByTestId('person-who-nobody')).toBeNull()
    fireEvent.click(screen.getByTestId('person-open-card'))
    const use = await screen.findByTestId('look-use') as HTMLButtonElement
    expect(use.textContent).toContain('In use')
    expect(use.disabled).toBe(true)
    expect(screen.queryByTestId('look-nobody')).toBeNull()
  })

  it('a refusal keeps the card open and says so in a plain sentence', async () => {
    f = routes(design())
    const closed = vi.fn()
    render(<Host io={kitIo(true)} start={start} onClose={closed} />)
    fireEvent.click(await screen.findByTestId('look-cand-1'))
    fireEvent.click(screen.getByTestId('look-use'))
    const err = await screen.findByTestId('look-use-error')
    expect(err.textContent).toMatch(/Making them play the subject did not work/)
    expect(closed).not.toHaveBeenCalled()
    expect(screen.getByTestId('person-who-nobody')).toBeTruthy()
    expect((screen.getByTestId('look-use') as HTMLButtonElement).textContent).toContain('Use this look') // not marked done
  })
})
