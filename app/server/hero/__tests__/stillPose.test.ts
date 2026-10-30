// A keyframe still says the pose at ITS frame (lift wave, 2026-10-25; E146): when the take plays an action whose clip names its own
// pose by phase, the still's action words are that pose (frame 0: standing, both hands empty; the hold: the frame up in both hands),
// never the whole beat ("lifts a frame out of the hive" drew the frame in her hands on frame 0). And a piece whose top the top edge
// cuts is said to run out of the picture, so a canopy at the edge is not drawn as a hat with a face. Pure; nothing paid.
import { describe, expect, it } from 'vitest'
import type { BibleRecord } from '../../../src/shared/bibleContract.ts'
import type { SceneBriefV2 } from '../../../src/shared/briefContract.ts'
import { compile } from '../../../src/stage3d/motion/compile.ts'
import { diskLibrary, KNEEL_END, LIFT_HERE, LIFT_ON, STRAIGHT } from '../../../src/stage3d/__tests__/motion.fixture.ts'
import { buildDrawPrompt, type StillPromptParts } from '../kitStillPrompt.ts'
import { cutAtTop } from '../kitView.ts'
import { motionAt } from '../stillAction.ts'

const CAM = { position: [0, 1.6, 6], quaternion: [0, 0, 0, 1], focal: 50 }
const BRIEF: SceneBriefV2 = {
  logline: '@keeper lifts a frame from @hive',
  place: { setting: 'an apple orchard', period: '', season: 'autumn', time: 'late afternoon', weather: 'clear' },
  light: { key: 'low sun', direction: 'from the left', height: 'low', quality: 'soft', colour: 'warm', others: '', effect: '' },
  atmosphere: [],
  elements: [{ name: 'the keeper', tag: 'keeper', type: 'person', look: '', supported: true, materials: '', condition: '', face: '' }],
  beats: [{ who: '@keeper', does: 'lifts a honeycomb frame out of the hive', seconds: 6, visible: 'squinting at it' }],
  camera: { size: '', angle: '', move: '', lensFeel: '' }, style: '', background: '', exclude: [], warnings: [], developed: [],
}
const BIBLE = { worldId: 'loc-x', version: 4, prompt: 'An orchard. Cast: @keeper.', master: null, candidates: [], lighting: '', materials: '', extrasSheet: null,
  grade: null, createdAt: 't', updatedAt: 't', elements: [{ tag: 'keeper', kind: 'cast', cardId: 'kp', refs: [], line: '' }], brief: BRIEF } as unknown as BibleRecord
const parts = (o: Partial<StillPromptParts>): StillPromptParts => ({ bible: BIBLE, plan: { sentence: 'An orchard.', kit: [] },
  cast: { cardId: 'kp', name: 'Keeper', description: 'An old woman in a smock' }, view: null, figures: [{ tag: 'hero', cx: 0.5, top: 0.3, bottom: 0.8, x0: 0.45, x1: 0.55 }], focal: 50, ...o })

describe('the pose at the still\'s own frame', () => {
  it('a lift take: frame 0 stands with empty hands, the hold has the frame up; both say they are the pose', async () => {
    const lib = await diskLibrary(), tl = compile(LIFT_HERE, lib), hold = tl.segs[1]
    // stage-only: the lift clip's phase words name no test piece (clips.ts)
    expect(motionAt(LIFT_HERE, 0, CAM, lib)).toEqual({ words: 'standing at the piece in front of them, both hands empty', pose: true })
    expect(motionAt(LIFT_HERE, (hold.t0 + hold.t1) / 2, CAM, lib).words).toMatch(/^holding something up at head height/)
    const walk = motionAt(LIFT_ON, 0.5, CAM, lib)
    expect(walk.pose).toBe(true) // still a lift take: the beat's end state is not drawn while she walks there
    expect(walk.words).toMatch(/^walking/)
    expect(motionAt(STRAIGHT, 3, CAM, lib).pose).toBe(false) // a plain walk: the beat goes first, as before
    expect(motionAt(KNEEL_END, 60, CAM, lib).words).toBe('kneeling')
  })
  it('the still prompt says that pose, not the beat, on a lift take; the beat still leads on a take whose action names no pose', () => {
    // stage-only: a Bible with no scene words takes the structured path these lines test
    const bible = { ...BIBLE, prompt: '' }
    const frame0 = buildDrawPrompt(parts({ bible, action: 'standing at the piece in front of them, both hands empty', pose: true, perfT: 0 }))
    expect(frame0).toMatch(/^An old woman in a smock,? standing at the piece in front of them, both hands empty, in an apple orchard/)
    expect(frame0).not.toMatch(/lifts|honeycomb|squinting/)
    const held = buildDrawPrompt(parts({ bible, action: 'holding something up at head height in both hands, looking at it', pose: true, perfT: 5 }))
    expect(held).toContain('holding something up at head height in both hands')
    const plain = buildDrawPrompt(parts({ bible, action: 'walking towards us', perfT: 0 }))
    expect(plain).toContain('The keeper lifts a honeycomb frame out of the hive, squinting at it.')
  })
  it('with scene words, the pose is its own sentence after the words, only when it is a clip\'s phase; the beat is not added', () => {
    const posed = buildDrawPrompt(parts({ action: 'standing at the piece in front of them, both hands empty', pose: true, perfT: 0 }))
    expect(posed).toContain('Cast: an old woman in a smock. She is standing at the piece in front of them, both hands empty.')
    expect(posed).not.toMatch(/lifts|honeycomb|squinting/)
    const walking = buildDrawPrompt(parts({ action: 'walking towards us', perfT: 0 }))
    expect(walking).not.toMatch(/walking towards us|lifts a honeycomb/)
  })
})

describe('a piece cut by the top edge', () => {
  it('a tall tree whose top runs out of the frame is found; a low box in the same frame is not', () => {
    const tree = { kind: 'deadTree', at: [1.5, -4] as [number, number], label: 'apple trees heavy with fruit' }, box = { kind: 'crates', at: [-1, -2] as [number, number] }
    expect(cutAtTop([tree, box], CAM)).toEqual([tree])
    expect(cutAtTop([{ ...tree, at: [1.5, -150] as [number, number] }], CAM)).toEqual([]) // far away it fits whole
  })
  it('the prompt says the cut piece runs out of the picture at the top edge, by its own name', () => {
    const tree = { kind: 'deadTree', at: [1.5, -4] as [number, number], label: 'apple trees heavy with fruit' }
    const view = { kinds: ['deadTree'], camera: '', pieces: [tree], cutTop: [tree] }
    expect(buildDrawPrompt(parts({ view, action: 'standing' }))).toContain('The tops of apple trees heavy with fruit run out of the picture at the top edge.')
    expect(buildDrawPrompt(parts({ view: { ...view, cutTop: [] }, action: 'standing' }))).not.toContain('top edge')
  })
})
