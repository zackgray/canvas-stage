// The person maker's two boxes on the server (stage-only plan, section 3; audit F1 to F3): unedited, the front prompt is today's
// byte for byte; an edited "Rules every look follows" and "How the picture is taken" reach the prompt the job is sent; a stated
// medium says "picture", not "photo"; an over-long picture text is refused before any spend.
import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES, defaultFraming, frontPrompt } from '../prompts.ts'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fakeJob, rig } from '../../jobs/__tests__/rig.ts'
import { createCast } from '../routes.ts'
import { DESC, info, post } from './cast-rig.ts'

/** the cast endpoint over a fake Cloud that keeps every workflow it is sent */
function setupCapture(sent: unknown[]) {
  const t = rig({ cap: 100 })
  const rt = t.restart({ fetchInfo: async () => info(), submit: async (wf) => { t.submits++; sent.push(wf); return fakeJob({ id: `aaaaaaaa-0000-4000-8000-00000000${100 + t.submits}` }) } }, 100)
  return { t, cast: createCast({ publicDir: mkdtempSync(path.join(tmpdir(), 'cast-')), rt: () => rt, seed: () => 7 }) }
}

/** the front prompt as it was before the boxes existed (pinned: an unedited press must not change by a byte) */
const TODAY = 'Full-length character reference photo, front view, head to toe, of an original character whose face is clearly visible: '
  + 'a stocky woman in her forties with a grey crop, a broken nose and a quilted waxed-cotton work jacket. '
  + 'An original character: no likeness of any real person, film, comic, game or franchise character, no logo or emblem. '
  + 'No logos, printed text, brand marks or patches; plain straps; no resemblance to any real person. '
  + 'A distinct silhouette: a clearly different build, hair and outfit shape from other characters. '
  + 'Real fabrics, not plastic or latex; natural skin. '
  + 'Relaxed neutral stance, arms hanging slightly away from the sides, feet shoulder-width apart, looking straight at the camera. '
  + 'The whole figure is in frame, head to shoes, centred: the full head, hair and face are in frame and sharp, with clear space '
  + 'above the head and below the feet; never cropped at the neck or shoulders. Plain light-grey studio background, soft even front lighting.'

/** the prompt text of the one job the route sent */
function sentPrompt(sent: unknown[]): string {
  const texts: string[] = []
  const walk = (v: unknown) => {
    if (!v || typeof v !== 'object') return
    const o = v as Record<string, unknown>
    if (o.class_type === 'CLIPTextEncode' && typeof (o.inputs as { text?: unknown })?.text === 'string') texts.push((o.inputs as { text: string }).text)
    Object.values(o).forEach(walk)
  }
  walk(sent.at(-1))
  return texts[0] ?? ''
}

describe('the person maker\'s boxes', () => {
  it('unedited: the prompt is today\'s, byte for byte', () => {
    expect(frontPrompt(DESC)).toBe(TODAY)
    expect(frontPrompt(DESC, DEFAULT_RULES)).toBe(TODAY)
  })
  it('review F10: a card\'s "A detailed character concept sheet for …" opener comes off; the rest is today\'s byte for byte', () => {
    expect(frontPrompt(`A detailed character concept sheet for ${DESC}`)).toBe(TODAY)
    expect(frontPrompt(`A detailed character concept sheet for ${DESC}`)).not.toMatch(/concept sheet/i)
    expect(frontPrompt(`A detailed character concept sheet for ${DESC}`, 'Plain.', 'A portrait.')).toBe(`A portrait. ${DESC}. Plain.`)
  })
  it('an edited rules box and picture box reach the prompt; the picture box replaces the head and the tail', () => {
    const p = frontPrompt(DESC, 'Plain work clothes only.', 'A seated portrait by a window, warm side light.')
    expect(p).toBe(`A seated portrait by a window, warm side light. ${DESC}. Plain work clothes only.`)
    expect(p).not.toMatch(/reference photo|light-grey studio/)
  })
  it('a stated medium says picture, not photo; the face-visible words stay; the box shows the same default', () => {
    const p = frontPrompt('an old cook in a striped apron, as a watercolour illustration')
    expect(p.startsWith('Full-length character reference picture, front view')).toBe(true)
    expect(p).toMatch(/face is clearly visible/)
    expect(defaultFraming(DESC)).toMatch(/^Full-length character reference photo, .*visible\. Relaxed neutral stance/)
    expect(defaultFraming('a cook, in anime style')).toMatch(/^Full-length character reference picture/)
  })
  it('the route: no framing sends today\'s prompt; edited boxes are what the job is sent; too long is refused for free', async () => {
    const sent: unknown[] = []
    const { cast: c2, t: t2 } = setupCapture(sent)
    expect((await post(c2, 'candidates', { cardId: 'cook', description: DESC, count: 1 })).status).toBe(200)
    expect(sentPrompt(sent)).toBe(TODAY)
    expect((await post(c2, 'candidates', { cardId: 'cook', description: DESC, count: 1, rules: 'Plain work clothes only.', framing: 'A seated portrait.' })).status).toBe(200)
    expect(sentPrompt(sent)).toBe(`A seated portrait. ${DESC}. Plain work clothes only.`)
    const before = t2.submits
    const r = await post(c2, 'candidates', { cardId: 'cook', description: DESC, count: 1, framing: 'x'.repeat(1501) })
    expect(r.status).toBe(400)
    expect((r.body as { error: string }).error).toMatch(/picture words are too long/)
    expect(t2.submits).toBe(before)
  })
})
