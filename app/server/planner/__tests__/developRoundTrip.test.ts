// POST /__lab/planner/develop end to end on the fake Cloud (rig.ts): run 1's refused answer now lands first time (one job, no
// retry, no second bill), and a sleek idea's v2 answer comes back with its structure, nothing aged, at develop's own answer cap.
import { describe, expect, it } from 'vitest'
import { plannerCredits, type DevelopResponse } from '../../../src/shared/bibleContract.ts'
import type { DevelopedBrief } from '../briefCheck.ts'
import { setup } from './rig.ts'
import { RUN1_BRIEF, RUN1_IDEA, SLEEK_IDEA, SLEEK_V2 } from './v2rig.ts'

const briefOf = (r: { body: unknown }) => (r.body as DevelopResponse).brief as DevelopedBrief | null

describe('develop round trip', () => {
  it("run 1's answer: 200 on the first try with @honeycomb_frame and @wooden_hive, one job billed", async () => {
    const s = setup()
    s.answers.push({ brief: RUN1_BRIEF })
    const r = await s.call('/develop', { idea: RUN1_IDEA, mode: 'full' })
    expect(r.status).toBe(200)
    const b = briefOf(r)
    expect(b?.brief).toMatch(/lifts a @honeycomb_frame from a @wooden_hive\./)
    expect(r.body).toMatchObject({ attempts: 1, spentCredits: plannerCredits(1) })
    expect((r.body as DevelopResponse).retried).toBeUndefined()
    expect(s.jobs.submits).toBe(1)
    expect((await s.get('/run', { id: (r.body as DevelopResponse).runId })).status).toBe(200)
  })
  it('a sleek idea: the v2 brief comes back whole, every condition empty, the flat lines derived; the job asked for 1900 tokens', async () => {
    const s = setup()
    s.answers.push({ brief: `\`\`\`json\n${JSON.stringify(SLEEK_V2)}\n\`\`\`` })
    const r = await s.call('/develop', { idea: SLEEK_IDEA, mode: 'light' })
    expect(r.status).toBe(200)
    const b = briefOf(r)
    expect(b?.v2?.elements.map((e) => e.condition)).toEqual(['', '', ''])
    expect(b?.v2?.camera.angle).toBe('low camera')
    expect(b?.v2?.warnings).toEqual([])
    expect(b?.lighting).toBe('Daylight through the tall windows from the right of frame, high soft neutral white light, clean soft shadows under the model.')
    expect(b?.beats).toEqual(['Architect sets the scale model down on the glass table.', 'Architect steps back and looks at it.'])
    expect(s.submitted[0].json.g_brief.inputs.max_length).toBe(1900)
    expect(String(s.submitted[0].json.sys.inputs.value)).toMatch(/## Keep the idea\n/)
  })
  it('plans keep the old answer cap', async () => {
    const s = setup()
    s.answers.push({ p0: '{}' }, { p0: '{}' })
    await s.call('/plan', { prompt: 'A field.' })
    expect(s.submitted[0].json.g_p0.inputs.max_length).toBe(1100)
  })
})
