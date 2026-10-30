// @vitest-environment jsdom
// Prompt-fix pass (2026-10-30): the draw press's "What will be sent" is open from the start, shows each draw sentence the app adds as
// "Added by the app" with a switch per take, and the Chinese negative's English beside it. A switch turned off travels as
// `drawAdds` on the preview and the paid press (the server leaves those words out); on is today's request, byte for byte.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SentJob } from '../../../shared/stillPressContract'
import { resetSceneJobs } from '../../../jobs/sceneJobs'
import { resetCurrentTake, setCurrentTake } from '../../shoot/currentTake'
import { HeroStillBlock } from '../../shoot/HeroStillBlock'
import { resetClayStore } from '../../shoot/takeClay'
import { resetStillRecipe } from '../../shoot/stillRecipe'
import { base, clayDone, lab, serve } from '../../shoot/__tests__/heroStillHarness'
import { DrawPress } from '../DrawPress'
import { resetSentEdits } from '../sentEdits'
import { resetDrawAdds } from '../drawAddSwitches'

beforeEach(() => { vi.useRealTimers(); resetCurrentTake(); resetClayStore(); resetStillRecipe(); setCurrentTake('take-1') })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetClayStore(); resetSceneJobs(); resetSentEdits(); resetDrawAdds(); localStorage.clear() })

const TAIL = 'In the frame: race car; grandstand.'
const REST = "He's dressed in a red suit."
const jobs = (adds: { castRest?: boolean; frameTail?: boolean } = {}): SentJob[] => [
  { what: 'The draw (Qwen-Image 2512, held to the 3D set)', prompt: 'A driver.', composed: 'A driver.', edit: 'prompt', negative: '低分辨率', negativeEnglish: 'Low resolution', negativeSource: "Qwen's own recommended negative prompt",
    added: [{ key: 'castRest', text: REST, on: adds.castRest !== false }, { key: 'frameTail', text: TAIL, on: adds.frameTail !== false }] },
  { what: 'Then the finish (FLUX.2 Klein), on each drawing', prompt: 'A real photograph.', composed: 'A real photograph.', edit: 'finishPrompt' },
]

describe('"Added by the app" at the draw press', () => {
  it('open by default; each addition has a switch; off travels on the preview and the press, on is today\'s request', async () => {
    const s = base({ opening: { present: true, startKey: 'aaaa0001' }, clay: clayDone() })
    serve(s)
    const previews: Record<string, unknown>[] = [], presses: Record<string, unknown>[] = []
    const plain = fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url)
      if (u.startsWith('/__lab/hero/preview')) {
        const b = JSON.parse(String(init?.body)) as { drawAdds?: { castRest?: boolean; frameTail?: boolean } }
        previews.push(b)
        return new Response(JSON.stringify({ role: 'opening', frame: 0, prompt: 'A driver.', composed: 'A driver.', edited: false, preset: 'photographic', count: 1, price: 6, refs: [], depthUrl: null, sent: jobs(b.drawAdds) }),
          { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (u === '/__lab/hero' && init?.method === 'POST') presses.push(JSON.parse(String(init.body)))
      return plain(url, init)
    }))
    render(<><HeroStillBlock lab={lab} kit capture={async () => new Blob(['x'])} pressInBar bare /><DrawPress verb="Draw the first frame" primary building={false} worldId={null} /></>)
    const tail = await screen.findByTestId('draw-sent-0-added-frameTail')
    expect((screen.getByTestId('draw-sent-pop') as HTMLDetailsElement).open).toBe(true)
    expect(tail.textContent).toContain('Added by the app')
    expect(tail.textContent).toContain(TAIL)
    expect(screen.getByTestId('draw-sent-0-added-castRest').textContent).toContain(REST)
    expect(screen.getByTestId('draw-sent-0-neg-en').textContent).toBe("In English: Low resolution. (Qwen's own recommended negative prompt.)")
    expect(previews[0]).not.toHaveProperty('drawAdds')
    fireEvent.click(screen.getByTestId('draw-sent-0-added-frameTail-switch'))
    await waitFor(() => expect(previews.at(-1)).toMatchObject({ drawAdds: { frameTail: false } }))
    await waitFor(() => expect((screen.getByTestId('draw-sent-0-added-frameTail-switch') as HTMLInputElement).checked).toBe(false))
    fireEvent.click(screen.getByTestId('draw-sent-0-added-frameTail-switch')) // back on: forgotten, not sent
    await waitFor(() => expect(previews.at(-1)).not.toHaveProperty('drawAdds'))
    await waitFor(() => expect((screen.getByTestId('draw-sent-0-added-frameTail-switch') as HTMLInputElement).checked).toBe(true))
    fireEvent.click(screen.getByTestId('draw-sent-0-added-castRest-switch'))
    await waitFor(() => expect(previews.at(-1)).toMatchObject({ drawAdds: { castRest: false } }))
    await waitFor(() => expect((screen.getByTestId('hero-render') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('hero-render'))
    await waitFor(() => expect(presses).toHaveLength(1))
    expect(presses[0].drawAdds).toEqual({ castRest: false })
  })
})
