// Wave 3 M2 and M4, pure: the planner's scene sentence fits the planner's limit for any brief Develop can write (and the planner's
// own input check accepts it), the reason Build the set cannot run is said before the press, and Guided's story beats never become
// the Bible's background action line.
import { describe, expect, it } from 'vitest'
import { intentFor, type RouteCtx } from '../../../../server/planner/routes'
import { BRIEF_LIMITS } from '../../../../server/planner/briefCheck'
import { bibleWrite, buildBlock, planSentence, PLAN_SENTENCE } from '../design/buildCheck'
import { castCard, freshGuided } from '../design/guided'
import { mkPiece } from '../design/model'
import { finishGuided } from '../design/routes'
import { freshDesign } from '../design/state'

const ctx = { store: { newRunId: () => 'run-1' }, now: () => new Date('2026-10-24T10:00:00Z'), seed: () => 7 } as unknown as RouteCtx
const place = 'A narrow track runs through an old beech forest, roots across the path and moss on every trunk.'

describe('the planner sentence (M2)', () => {
  it('a 1500-character brief becomes a sentence the planner accepts: untagged, place sentences first, inside 600', () => {
    const pieces = [mkPiece('robin', 'Robin', 'person'), mkPiece('knights', 'Knights', 'group'), mkPiece('mood', 'Mood', 'mood', { line: 'cold dusk light' })]
    const cast = 'Then @robin, the outlaw in green, runs hard between the trunks while @knights in dull plate close in behind him.'
    let brief = `${place} The light is @mood.`
    while (brief.length < BRIEF_LIMITS.brief - cast.length - place.length) brief += ` ${cast} ${place}`
    expect(brief.length).toBeGreaterThan(1200)
    const s = planSentence(brief, pieces)
    expect(s.length).toBeLessThanOrEqual(PLAN_SENTENCE)
    expect(s).not.toContain('@')
    expect(s.startsWith(place)).toBe(true)
    expect(s).toContain('cold dusk light')
    const intent = intentFor(ctx, 'plan', { prompts: [s] })
    expect(intent.items[0].user).toBe(s)
    // the whole brief, sent as before, is the refusal the fix removes
    expect(() => intentFor(ctx, 'plan', { prompts: [brief] })).toThrow(/longer than 600/)
  })

  it('a short brief is sent whole, untagged; one sentence too long is cut at a word', () => {
    expect(planSentence('A ruined hamlet at dusk. @robin waits.', [mkPiece('robin', 'Robin', 'person', { onBoard: true })])).toBe('A ruined hamlet at dusk. robin waits.')
    const long = `A ${'very '.repeat(200)}long road.`
    const s = planSentence(long, [])
    expect(s.length).toBeLessThanOrEqual(PLAN_SENTENCE)
    expect(s.endsWith('very')).toBe(true)
  })

  it('Build says why it cannot run before the press: only empty words or a draft tile', () => {
    const d = { ...freshDesign(), phase: 'board' as const, brief: `${place} @robin waits.` }
    const robin = mkPiece('robin', 'Robin', 'person', { onBoard: true })
    expect(buildBlock(d, [robin])).toBe('Approve every tile first: @robin is still a draft')
    expect(buildBlock(d, [{ ...robin, state: 'approved', looks: ['/lab-assets/x.png'] }])).toBeNull()
    // words and no tile at all: buildable (the set is built from the words; a fresh design's phase is not a reason)
    expect(buildBlock({ ...freshDesign(), brief: place }, [])).toBeNull()
    // no words: the one reason, whatever the tiles
    expect(buildBlock({ ...freshDesign(), brief: '  ' }, [])).toMatch(/Write the scene words first/)
  })
})

describe('Guided story beats (M4)', () => {
  it('stay beats: a Guided design writes no background action line unless one was written', () => {
    const g = freshGuided([{ ...castCard('Robin', 'person', 'an outlaw'), cands: ['/lab-assets/cast/robin-a/draft/cand-1.png'], pick: 0 }])
    g.st.loc = { ...g.st.loc, text: 'an old forest', cands: ['/l.png'], picks: [0] }
    g.st.story = { ...g.st.story, text: 'He runs, they close in, he vanishes into the fog.', cands: ['/b1.png'], picks: [0] }
    const d = { ...freshDesign(), ...finishGuided(freshDesign(), g) }
    expect(d.action).toBe('')
    expect(bibleWrite(d)).not.toHaveProperty('background')
    expect(bibleWrite(d).prompt).toContain('vanishes into the fog') // the beats are still the brief's words
    // a line written by hand elsewhere is kept
    const kept = { ...freshDesign(), ...finishGuided({ ...freshDesign(), action: 'riders far behind' }, g) }
    expect(bibleWrite(kept).background).toBe('riders far behind')
  })
})
