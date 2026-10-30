// @vitest-environment jsdom
// The first frame's draw on the Stage (owner 10-29): the press shows its working state the moment it is pressed, while the free
// frames update runs before the paid draw (fix D); and its "What will be sent" holds one editable box per prompt it sends, the draw
// and the finish, each sent exactly as written, Reset back to the composed words (fix G). A fake fetch plays the hero server.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SentJob } from '../../../shared/stillPressContract'
import { resetSceneJobs } from '../../../jobs/sceneJobs'
import { resetCurrentTake, setCurrentTake } from '../../shoot/currentTake'
import { HeroStillBlock, PREPPING } from '../../shoot/HeroStillBlock'
import { resetClayStore } from '../../shoot/takeClay'
import { resetStillRecipe } from '../../shoot/stillRecipe'
import { base, clayDone, lab, serve, type Server } from '../../shoot/__tests__/heroStillHarness'
import { DrawPress } from '../DrawPress'
import { resetSentEdits } from '../sentEdits'

beforeEach(() => { vi.useRealTimers(); resetCurrentTake(); resetClayStore(); resetStillRecipe(); setCurrentTake('take-1') })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetClayStore(); resetSceneJobs(); resetSentEdits(); localStorage.clear() })

const DRAW = 'A driver beside the car on a wet track at night.'
const FINISH = 'A real photograph: image 1 exactly as it is, with the person in it made the person shown in image 2.'
const sent = (prompt = DRAW, finish = FINISH): SentJob[] => [
  { what: 'The draw (Qwen-Image 2512, held to the 3D set)', prompt, composed: DRAW, edit: 'prompt', negative: 'text, logos' },
  { what: 'Then the finish (FLUX.2 Klein), on each drawing', prompt: finish, composed: FINISH, edit: 'finishPrompt' },
]
/** the hero server; the preview echoes what it was asked to send, as the server's composer does */
function serveWithPreview(s: Server, bodies: Record<string, unknown>[]) {
  serve(s)
  const plain = fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.startsWith('/__lab/hero/preview')) {
      const b = JSON.parse(String(init?.body)) as { prompt?: string; finishPrompt?: string }
      return new Response(JSON.stringify({ role: 'opening', frame: 0, prompt: b.prompt ?? DRAW, composed: DRAW, edited: !!b.prompt, preset: 'photographic', count: 1, price: 6, refs: [], depthUrl: null, sent: sent(b.prompt, b.finishPrompt) }),
        { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (u === '/__lab/hero' && init?.method === 'POST') bodies.push(JSON.parse(String(init.body)))
    return plain(url, init)
  }))
}
const Mount = ({ prepare }: { prepare?: () => Promise<never> }) => (
  <><HeroStillBlock lab={lab} kit capture={async () => new Blob(['x'])} pressInBar bare prepare={prepare} /><DrawPress verb="Draw the first frame" primary building={false} worldId={null} pop /></>
)

describe('the first frame draw press', () => {
  it('shows its working state at once while the free frames update runs, and the press is gone against a second click', async () => {
    const s = base({ opening: { present: true, startKey: 'aaaa0001' }, clay: null })
    serveWithPreview(s, [])
    let done!: () => void
    const prepare = vi.fn(() => new Promise<never>((r) => { done = () => r(clayDone() as never) }))
    render(<Mount prepare={prepare} />)
    fireEvent.click(await screen.findByTestId('hero-render'))
    expect((await screen.findByTestId('hero-phase')).textContent).toMatch(PREPPING)
    expect(screen.queryByTestId('hero-render')).toBeNull()
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(s.calls).not.toContain('POST /__lab/hero')
    done()
  })

  it('both prompts are editable; each goes as written, the images untouched; Reset sends the composed words again', async () => {
    const s = base({ opening: { present: true, startKey: 'aaaa0001' }, clay: clayDone() })
    const bodies: Record<string, unknown>[] = []
    serveWithPreview(s, bodies)
    render(<Mount />)
    const draw = await screen.findByTestId('draw-sent-0-text') as HTMLTextAreaElement
    const finish = screen.getByTestId('draw-sent-1-text') as HTMLTextAreaElement
    expect(draw.value).toBe(DRAW)
    expect(finish.value).toBe(FINISH)
    fireEvent.change(draw, { target: { value: 'A driver, helmet off, beside the car.' } })
    fireEvent.change(finish, { target: { value: 'Image 1 exactly as it is.' } })
    expect(screen.getByTestId('draw-sent-0-edited')).toBeTruthy()
    expect(screen.getByTestId('draw-sent-1-edited')).toBeTruthy()
    await waitFor(() => expect((screen.getByTestId('hero-render') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('hero-render'))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toMatchObject({ prompt: 'A driver, helmet off, beside the car.', finishPrompt: 'Image 1 exactly as it is.' })
    await waitFor(() => expect(screen.getByTestId('hero-render')).toBeTruthy())
    fireEvent.click(screen.getByTestId('draw-sent-0-reset'))
    fireEvent.click(screen.getByTestId('draw-sent-1-reset'))
    expect((screen.getByTestId('draw-sent-0-text') as HTMLTextAreaElement).value).toBe(DRAW)
    await waitFor(() => expect((screen.getByTestId('hero-render') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('hero-render'))
    await waitFor(() => expect(bodies).toHaveLength(2))
    expect(bodies[1]).not.toHaveProperty('finishPrompt')
    expect(bodies[1]).not.toHaveProperty('prompt')
    const { prompt: _p, finishPrompt: _f, ...rest } = bodies[0]
    expect(bodies[1]).toEqual(rest) // only the words changed: the role, the lock, the refs and the take are the same
  })
})
