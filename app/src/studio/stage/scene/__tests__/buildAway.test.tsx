// @vitest-environment jsdom
// Review F3 (stage-only fix pass): a Build the set plan that lands on a page that did not press it (a reload mid-plan) builds the set
// AND approves it (free), as the press does, so "It is approved and ready on the Stage" holds and Draw does not refuse with
// "Approve the set first". Real job store with the server's record faked; the brief, Bible and kit are fakes; nothing paid.
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SceneJobs } from '../../../../jobs/sceneJobs'
import type { LibraryApi } from '../../../../library/api'
import type { ProjectionLabState } from '../../../../labs/projection/useProjectionLab'
import { plannerCredits } from '../../../../shared/bibleContract'
import { fakeBrief, paidCalls, type FakeBrief } from '../../../scene/__tests__/briefFakes'
import { fakeApi, kitDeps, kitShot } from '../../../scene/__tests__/fakes'
import { castCard, freshGuided, propCard } from '../../../scene/design/guided'
import { freshDesign, markUnsynced, saveDesign } from '../../../scene/design/state'
import { StageSceneProvider } from '../StageScene'

const SCENE = 'sc-20261029030000-away'
const lab = () => ({ kit: { id: null, world: null }, refreshShots: vi.fn(async () => [kitShot]), set: vi.fn() }) as unknown as ProjectionLabState

let brief: FakeBrief, bible: ReturnType<typeof fakeApi>, kit: ReturnType<typeof kitDeps>
beforeEach(() => {
  localStorage.clear()
  brief = { ...fakeBrief(), parse: async (_j: unknown, r: { status: number; body: unknown }) => r.body } as unknown as FakeBrief
  bible = fakeApi(); kit = kitDeps()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 404 })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

describe('a plan that lands after a reload', () => {
  it('builds the set and approves it, free, with no second plan', async () => {
    saveDesign({ ...freshDesign(), brief: 'A small kitchen at dawn. @mara lifts the copper kettle.',
      guided: { ...freshGuided([castCard('Mara', 'person', 'a cook in a faded blue apron')]), props: [propCard('Copper kettle', 'a dented copper kettle')] } }, SCENE)
    markUnsynced(SCENE)
    // the server's record of the plan the page pressed before the reload, finished, with its reply kept
    const body = await brief.plan({ prompts: ['a small kitchen'] })
    brief.plan.mockClear()
    const old = new Date(Date.now() - 60_000).toISOString()
    const record = { id: 'j-old', scene: SCENE, intent: 'plan', target: 'build', price: plannerCredits(1), route: '/__lab/planner', status: 'done', startedAt: old, finishedAt: old, reply: { status: 200, body } }
    const api = { jobs: vi.fn(async () => [record]), clearJob: vi.fn(async () => true) } as unknown as LibraryApi
    const jobs = new SceneJobs(SCENE, { api, storage: null })
    render(<StageSceneProvider scene={SCENE} worldId={null} lab={lab()} deps={{ api: brief, bible: bible.api, jobs, buildKit: kit }} />)
    await act(async () => { await new Promise((k) => setTimeout(k, 50)) })
    await act(async () => { await jobs.sync() })
    await waitFor(() => expect(kit.create).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(bible.api.approveSet).toHaveBeenCalledTimes(1))
    expect(brief.plan).not.toHaveBeenCalled()
    // nothing paid starts on a reload (was jobs/noPaidOnReload): no planner call, no concept draw, no master draw, one free build
    await act(async () => { await new Promise((k) => setTimeout(k, 100)) })
    expect(paidCalls(brief)).toBe(0)
    expect(bible.api.drawMaster).not.toHaveBeenCalled()
    expect(kit.create).toHaveBeenCalledTimes(1)
    expect(api.clearJob).toHaveBeenCalledTimes(1) // the record was claimed once, so it is never handed over again
  })
})
