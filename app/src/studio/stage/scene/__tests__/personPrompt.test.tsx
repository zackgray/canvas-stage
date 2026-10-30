// @vitest-environment jsdom
// The person card's words (owner 2026-10-29: "does the character have the prop card's stuck Advanced prompt?"). Every box holds
// what is typed (a Backspace never snaps back or stores the default minus a letter); clearing 'How the picture is taken' or the
// no-logos line really clears it (nothing of the default head, tail or line goes); the exact text the next Generate looks sends is
// shown before the press and is what the request carries (the server's own composer, the same inputs). Fakes only; nothing spends.
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SceneJobs } from '../../../../jobs/sceneJobs'
import type { KitWorld } from '../../../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../../../labs/projection/useProjectionLab'
import type { DraftDesign } from '../../../../shared/sceneContract'
import { fakeApi, WORLD } from '../../../scene/__tests__/fakes'
import { briefApi, DEFAULT_LOOK_RULES } from '../../../scene/briefApi'
import { castCard, freshGuided } from '../../../scene/design/guided'
import { freshDesign, type Design } from '../../../scene/design/state'
import { frontPrompt } from '../../../../../server/cast/prompts'
import { PersonCard } from '../../panels/PersonLook'
import { setPieceBuildApi } from '../../pieceBuilding'
import { StageSceneProvider, type KitIo } from '../StageScene'

const SCENE = 'sc-test-person-prompt'
const DESC = 'a tall cook in a white apron, seen in profile'
const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
const LAB = { kit: { id: WORLD, world: null } } as unknown as ProjectionLabState
const asked: Record<string, unknown>[] = []

function routes(design: Design) {
  let rec = { design: design as unknown as DraftDesign, revision: 1, updatedAt: 't' }
  return vi.fn(async (url: string, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {}
    if (url.startsWith('/__lab/scene/draft?project=')) return ok({ draft: rec })
    if (url === '/__lab/scene/draft' && init?.method === 'POST') { rec = { design: body.design as DraftDesign, revision: rec.revision + 1, updatedAt: 't' }; return ok({ draft: rec }) }
    if (url === '/__lab/cast/candidates') { asked.push(body); return ok({ candidates: ['/lab-assets/cast/x/draft/cand-1.png'] }) }
    return ok({ error: 'no' }, 404)
  })
}
const kit = { get: vi.fn(async (id: string) => ({ id, perf: { path: [[0, 0]] } }) as unknown as KitWorld), savePerf: vi.fn() } as unknown as KitIo
const world = { id: WORLD, perf: { path: [[0, 0]] } } as unknown as KitWorld

beforeEach(() => {
  asked.length = 0; localStorage.clear()
  setPieceBuildApi({ get: vi.fn(async () => ({ price: 8, tiles: [], running: null, setChangedAt: null, stillStale: false })), build: vi.fn(), recover: vi.fn(), complete: vi.fn() })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 404 })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setPieceBuildApi(null); localStorage.clear() })

function mount() {
  const f = routes({ ...freshDesign(), screen: 'board', phase: 'board', pieces: [], guided: freshGuided([castCard('Cook', 'person', DESC)]) })
  render(
    <StageSceneProvider scene={SCENE} worldId={WORLD} lab={LAB} deps={{ api: briefApi(f as never, SCENE), bible: fakeApi().api, jobs: new SceneJobs(null), kit }}>
      <PersonCard world={world} onClose={() => {}} />
    </StageSceneProvider>)
}
const sent = () => screen.getByTestId('look-sent').textContent!.replace(/^What will be sent: /, '')

describe("the person card's words", () => {
  it('the exact words are shown before Generate, and they are what the request carries', async () => {
    mount()
    await screen.findByTestId('look-sent')
    expect(sent()).toBe(frontPrompt(DESC, DEFAULT_LOOK_RULES, undefined))
    expect(sent()).toMatch(/seen in profile/)
  })

  it('a Backspace in How the picture is taken stays as typed; clearing it and the no-logos line really clears them', async () => {
    mount()
    fireEvent.click(await screen.findByTestId('object-tab-advanced'))
    const framing = await screen.findByTestId('look-framing') as HTMLTextAreaElement
    const full = framing.value
    fireEvent.change(framing, { target: { value: full.slice(0, -1) } })
    expect((screen.getByTestId('look-framing') as HTMLTextAreaElement).value).toBe(full.slice(0, -1)) // no snap back
    fireEvent.change(screen.getByTestId('look-framing'), { target: { value: '' } })
    fireEvent.change(screen.getByTestId('look-rules'), { target: { value: '' } })
    expect((screen.getByTestId('look-framing') as HTMLTextAreaElement).value).toBe('')
    expect((screen.getByTestId('look-rules') as HTMLTextAreaElement).value).toBe('') // the no-logos line is not put back
    fireEvent.click(screen.getByTestId('object-tab-look'))
    expect(sent()).toBe(`${DESC}.`) // nothing of the default head, tail or line
    fireEvent.click(screen.getByTestId('look-generate'))
    await waitFor(() => expect(asked).toHaveLength(1))
    expect(asked[0]).toMatchObject({ description: DESC, framing: '', rules: '' })
    expect(frontPrompt(asked[0].description as string, asked[0].rules as string, asked[0].framing as string)).toBe(sent())
  })
})
