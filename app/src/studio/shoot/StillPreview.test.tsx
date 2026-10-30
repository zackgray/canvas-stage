// @vitest-environment jsdom
// The press preview under Draw this frame (troubleshooting review items 1 and 8): the recipe prompt prefilled and editable (the
// edit is what goes), the depth image beside the 3D set frame, Lock: Photographic / Tight (numbers only in the tooltip), the
// board-tile refs with Drop, and "Draw again with this seed" priced. The preview route is free; only the press is a paid POST.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { resetStillRecipe } from './stillRecipe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HeroStill, TakeRecord } from '../../shared/shotContract'
import type { StillPreviewRequest, StillPreviewResponse } from '../../shared/stillPressContract'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { resetCurrentTake, setCurrentTake } from './currentTake'
import { resetSceneJobs } from '../../jobs/sceneJobs'
import { HeroStillBlock } from './HeroStillBlock'
import { resetClayStore } from './takeClay'

const take: TakeRecord = { id: 'take-1', worldId: 'loc-1', packId: 'pack-1', fps: 24, frames: 121, perfStart: 0, startKey: 'aaaa0001', focal: 50, viewAspect: 16 / 9,
  samples: [{ t: 0, position: [0, 1.6, 4], quaternion: [0, 0, 0, 1], focal: 50, focus: 4 }], lockedAt: 't', createdAt: 't' }
const still: HeroStill = { id: 'hero-o1', takeId: 'take-1', startKey: 'aaaa0001', png: '/x/hero-o1.png', seed: 1059417846, jobId: 'j', credits: 21, approved: false, createdAt: 't', role: 'opening', frame: 0 } as HeroStill
const clay = { takeId: 'take-1', startKey: 'aaaa0001', mp4: '/c.mp4', frames: 121, width: 1920, height: 1088, status: 'done', finishedAt: 'f1', depth: { unitM: 0.001 } }
const COMPOSED = 'Photo of a conductor walking towards us, a snowy platform at dawn. Hard low sun behind them, the only light. 50mm lens, Kodak Vision3 250D.'
const lab = { stage: null, s: { source: 'loc-1' } } as unknown as ProjectionLabState

const Panel = () => <><HeroStillBlock lab={lab} kit capture={async () => new Blob(['x'])} /></>

function serve() {
  const previews: StillPreviewRequest[] = [], presses: Record<string, unknown>[] = []
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const p = String(url)
    if (p.startsWith('/__lab/takes')) return json({ takes: [take] })
    if (p.startsWith('/__lab/clay')) return json({ clay })
    if (p.startsWith('/__lab/hero/preview')) {
      const q = JSON.parse(String(init?.body)) as StillPreviewRequest; previews.push(q)
      const sent = q.materials ?? ['steam_train', 'platform']
      const r: StillPreviewResponse = { role: q.role ?? 'opening', frame: 0, prompt: q.prompt ?? COMPOSED, composed: COMPOSED, edited: q.prompt !== undefined, preset: q.preset ?? 'photographic',
        count: q.count ?? 2, price: 21 * (q.count ?? 2), depthUrl: '/x/preview-depth-000.png?v=1',
        finishPrompt: 'A real photograph: image 1 exactly as it is.', faceRedrawPrompt: 'A real photograph. In image 1, redraw only the face.',
        warnings: q.prompt ? [{ code: 'negation', message: 'Negatives ("no") can draw the thing they name; say what is there instead.' }] : [], refs: [
          { tag: 'steam_train', kind: 'prop', url: '/x/train.png', label: '@steam_train · set piece', sent: sent.includes('steam_train') },
          { tag: 'platform', kind: 'material', url: '/x/plat.png', label: '@platform · material', sent: sent.includes('platform') }] }
      return json(r)
    }
    if (p === '/__lab/hero' && init?.method === 'POST') { presses.push(JSON.parse(String(init.body))); return json({ still }) }
    return json({ stills: [still], opening: { present: true, startKey: 'aaaa0001' }, running: null, unrecovered: [], unfinished: [] })
  }))
  return { previews, presses }
}

beforeEach(() => { resetCurrentTake(); resetClayStore(); setCurrentTake('take-1'); sessionStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetClayStore(); resetSceneJobs(); resetStillRecipe() })

describe('the still press preview', () => {
  it('the default press sends the preview\'s default refs and no prompt (the server composes the same words)', async () => {
    const s = serve()
    render(<Panel />)
    await screen.findByTestId('still-ref-platform')
    fireEvent.click(screen.getByTestId('hero-render'))
    await waitFor(() => expect(s.presses).toHaveLength(1))
    expect(s.presses[0]).toMatchObject({ preset: 'photographic', materials: ['steam_train', 'platform'] })
    expect(s.presses[0]).not.toHaveProperty('prompt')
  })
  it('"Draw again with this seed" is priced for one still and sends that seed, once', async () => {
    const s = serve()
    render(<Panel />)
    const btn = await screen.findByTestId('hero-redraw-hero-o1')
    expect(btn.parentElement?.textContent).toMatch(/Draw again with this seed.*21 cr/)
    fireEvent.click(btn)
    await waitFor(() => expect(s.presses).toHaveLength(1))
    expect(s.presses[0]).toMatchObject({ takeId: 'take-1', count: 1, seed: 1059417846, preset: 'photographic' })
  })
})
