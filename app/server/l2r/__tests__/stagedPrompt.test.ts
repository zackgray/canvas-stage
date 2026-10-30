// Recipe step 5: the Render prompt names the STAGED cast only (the hero card + every extra bound to a Bible element), in the LTX guide
// shape. E137/E138 grew an unstaged traveller out of the trunk because every cast element of the Bible was described.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PROJECT, emptyProject } from '../../../src/project/model.ts'
import { biblePaths, type BibleRecord } from '../../../src/shared/bibleContract.ts'
import type { TakeRecord } from '../../../src/shared/shotContract.ts'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import type { ExtraPlan } from '../../../src/stage3d/contract.ts'
import { KitStore } from '../../stage3d/store.ts'
import * as THREE from 'three'
import type { SceneBriefV2 } from '../../../src/shared/briefContract.ts'
import type { KitWorld } from '../../stage3d/types.ts'
import { defaultPrompt } from '../compose.ts'
import { stagedDefault } from '../stagedDefault.ts'
import { warnPrompt } from '../../prompt/warn.ts'
import { heroDoing, stagedCast } from '../stagedPrompt.ts'
import { dropMentions } from '../../prompt/sceneWords.ts'

const el = (tag: string, kind: 'cast' | 'prop', cardId?: string, line = '') => ({ tag, kind, ...(cardId ? { cardId } : {}), refs: [], line })
const bible = (o: Partial<BibleRecord> = {}): BibleRecord => ({ worldId: 'w', version: 1, prompt: '', master: null, candidates: [], lighting: '', materials: '', extrasSheet: null, grade: null,
  createdAt: 't', updatedAt: 't', elements: [el('conductor', 'cast', 'cond'), el('traveller', 'cast', 'trav'), el('steam_train', 'prop', undefined, 'an old riveted black locomotive')], ...o })
const extra = (o: Partial<ExtraPlan> = {}): ExtraPlan => ({ path: [[1, 1], [1, 2]], gait: 'walk', delay: 0, costume: 'modern', variant: 0, ...o })
const DESC_BY_CARD = { cond: 'a stout man in a dark greatcoat and peaked cap', trav: 'a lean young man in a worn brown jacket' }
const DESC = { cond: 'a stout man in a dark greatcoat and peaked cap', trav: 'a lean young man in a worn brown jacket' }

describe('who is staged', () => {
  it('the hero and the extras bound to a Bible element; an untagged extra or an unknown tag adds no one', () => {
    const s = stagedCast({ heroCardId: 'cond', action: 'the performer walks slowly towards the camera', extras: [extra({ tag: 'traveller', stand: true }), extra(), extra({ tag: 'ghost' })], bible: bible(), descriptions: DESC })
    expect(s).toEqual([
      { tag: 'conductor', description: DESC.cond, doing: 'walks slowly towards the camera' },
      { tag: 'traveller', description: DESC.trav, doing: '' },
    ])
  })
  it('the hero alone when nobody else is staged: the other card is never read into the prompt', () => {
    expect(stagedCast({ heroCardId: 'cond', extras: [], bible: bible(), descriptions: DESC }).map((p) => p.description)).toEqual([DESC.cond])
  })
  it('what the hero does: a verb phrase in the take\'s action; an @tag action or a noun phrase says nothing for him', () => {
    expect(heroDoing('the performer stops and looks up.')).toBe('stops and looks up')
    expect(heroDoing('walks to the trunk')).toBe('walks to the trunk')
    expect(heroDoing('@ember roars behind him')).toBe('')
    expect(heroDoing('a dragon roars')).toBe('')
    expect(heroDoing(undefined)).toBe('')
  })
  it('mentions of unstaged cast are dropped; set pieces in the same clause stay as a bare mention; a staged person keeps the clause', () => {
    const gone = ['traveller'], staged = ['conductor']
    expect(dropMentions('@traveller sits on the trunk. A snowy platform.', gone, staged)).toBe('A snowy platform.')
    expect(dropMentions('@traveller waits by @steam_train, in the snow.', gone, staged)).toBe('@steam_train. in the snow.')
    expect(dropMentions('@conductor walks past @traveller.', gone, staged)).toBe('@conductor walks past.')
    expect(dropMentions('@conductor walks.', [], staged)).toBe('@conductor walks.')
  })
})

/** a kit world on disk with a Bible, a project with two cast cards, and the performance's staged people */
function kit(perf: { extras?: ExtraPlan[] }, b: Partial<BibleRecord> = {}) {
  const pub = path.join(mkdtempSync(path.join(tmpdir(), 'staged-')), 'public')
  const k = new KitStore(pub).create({ plan: { ...BATTLEFIELD, sentence: 'a snowy station platform at dawn' }, perf: { path: [[0, -20], [0, 4]], castId: 'cond', ...perf }, description: 'a platform' })
  const f = path.join(pub, ...biblePaths(k.id).file.split('/'))
  mkdirSync(path.dirname(f), { recursive: true })
  writeFileSync(f, JSON.stringify(bible({ worldId: k.id, ...b })))
  const refs = ['/lab-assets/cast/x/front.png', '/lab-assets/cast/x/face.png']
  for (const r of refs) { mkdirSync(path.dirname(path.join(pub, r)), { recursive: true }); writeFileSync(path.join(pub, r), 'img') }
  const p = emptyProject(DEFAULT_PROJECT, 'P', '2026-10-20T00:00:00.000Z')
  for (const [id, description] of Object.entries(DESC)) p.ingredients.cast.push({ id, name: id, versions: [{ version: 1, created: 't', payload: { name: id, description, references: refs, sheets: [] } }] })
  mkdirSync(path.join(pub, 'lab-assets', 'projects', DEFAULT_PROJECT), { recursive: true })
  writeFileSync(path.join(pub, 'lab-assets', 'projects', DEFAULT_PROJECT, 'project.json'), JSON.stringify(p))
  return { pub, kit: new KitStore(pub).read(k.id), bible: bible({ worldId: k.id, ...b }), take: { id: 'take-x', worldId: k.id, packId: null, frames: 49, action: 'the performer walks slowly towards the camera' } as TakeRecord }
}
const SCENE = '@conductor walks along a snowy platform beside @steam_train. @traveller sits on a trunk. Dawn light.'

describe('the default Render prompt of a kit take', () => {
  it('names the hero and not the unstaged traveller, in plain words', async () => {
    const k = kit({}, { prompt: SCENE, lighting: 'Dawn: a low sun behind them' })
    const p = await defaultPrompt(k.pub, k.take)
    expect(p.toLowerCase()).toContain(DESC.cond)
    expect(p).not.toMatch(/traveller|lean young man|brown jacket|sits on a trunk/i)
    expect(p).toMatch(/walks slowly towards the camera/)
    // the scene words lead and carry the light; nothing is added after them (no Match line, no keep line, no closer)
    expect(p).toMatch(/Dawn light\. /)
    expect(p).not.toMatch(/as the driver|Match the first frame|Photoreal|A photograph\./)
  })
  // the standing extra is put on the kit directly (the store's sanitiser learns `stand` with the blocking track)
  const staged = (prompt: string) => {
    const k = kit({}, { prompt })
    const kitWorld = { ...k.kit, perf: { ...k.kit.perf, extras: [extra({ tag: 'traveller', stand: true })] } }
    return stagedDefault({ take: k.take, kit: kitWorld, bible: k.bible, hero: { cardId: 'cond', description: DESC.cond }, descriptions: DESC_BY_CARD })
  }
  it('staging the traveller as a standing extra the scene does not name: a sentence of his own, from his card (an extra with no beat does nothing)', () => {
    const p = staged('@conductor walks along a snowy platform beside @steam_train.')
    // updated deliberately: the piece is said by its line (sceneWords), the hero's action follows by his name
    expect(p).toMatch(/^A stout man in a dark greatcoat and peaked cap walks along a snowy platform beside an old riveted black locomotive\. The conductor walks slowly towards the camera\./)
    expect(p).toContain(`${DESC.trav[0].toUpperCase()}${DESC.trav.slice(1)}.`)
    expect(p).not.toMatch(/stands waiting/)
  })
  it('a staged traveller the scene names stays in the scene sentence, from his card; "the performer" is the hero, said by name', () => {
    const p = staged(SCENE)
    expect(p.toLowerCase()).toContain(`${DESC.trav} sits on a trunk`)
    expect(p).toMatch(/The conductor walks slowly towards the camera\./) // updated deliberately: was "The person" (his second mention now)
    expect(p).not.toMatch(/performer/)
  })
  it('an @tag the Bible lacks is still refused (409 unknown_tag), whatever was dropped', async () => {
    const k = kit({}, { prompt: '@conductor meets @stranger.' })
    await expect(defaultPrompt(k.pub, k.take)).rejects.toMatchObject({ status: 409, code: 'unknown_tag' })
  })
})

describe('what the hero does (prompt wave): a pronoun- or name-led action is his', () => {
  it('"She lifts…", "He turns…", "Mara lifts…", "@mara lifts…", "the old man sits…" attach to the hero; another @tag still does not', () => {
    expect(heroDoing('She lifts a frame out of the hive.')).toBe('lifts a frame out of the hive')
    expect(heroDoing('He turns and runs')).toBe('turns and runs')
    expect(heroDoing('Mara lifts the lid', ['Mara'])).toBe('lifts the lid')
    expect(heroDoing('@old_man sits down', ['old_man'])).toBe('sits down')
    expect(heroDoing('the old man sits down', ['old_man'])).toBe('sits down')
    expect(heroDoing('She lifts @frame', ['x'])).toBe('')
    expect(heroDoing('Mara lifts the lid')).toBe('') // a name the hero does not carry is a noun phrase
    expect(heroDoing('Shelves fall')).toBe('')
  })
  it('a tagged extra does its own beat when the brief gives one, else what its motion shows', () => {
    const s = stagedCast({ heroCardId: 'cond', extras: [extra({ tag: 'traveller', stand: true })], bible: bible(), descriptions: DESC, beats: { traveller: 'checks his watch' } })
    expect(s[1]).toMatchObject({ tag: 'traveller', doing: 'checks his watch' })
  })
})

// ---------------------------------------------------------------- the v2 brief writes the render prompt (two unlike scenes, no tuning)
const q = (yawDeg: number, pitchDeg = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(pitchDeg * Math.PI / 180, yawDeg * Math.PI / 180, 0, 'YXZ')).toArray()
const samples = (n: number, secs: number, f: (k: number) => { pos: number[]; yaw?: number; pitch?: number }) =>
  Array.from({ length: n }, (_, i) => { const k = i / (n - 1), s = f(k); return { t: k * secs, position: s.pos, quaternion: q(s.yaw ?? 0, s.pitch ?? 0), focal: 24, focus: 10 } })
const light = (o: Partial<SceneBriefV2['light']>): SceneBriefV2['light'] => ({ key: '', direction: '', height: '', quality: '', colour: '', others: '', effect: '', ...o })
const elV2 = (name: string, tag: string, type: 'person' | 'prop' | 'group', materials = '', condition = '') => ({ name, tag, type, look: '', supported: true, materials, condition, face: '' })
const briefV2 = (o: Partial<SceneBriefV2>): SceneBriefV2 => ({ logline: '', place: { setting: '', period: '', season: '', time: '', weather: '' }, light: light({}), atmosphere: [], elements: [], beats: [],
  camera: { size: '', angle: '', move: '', lensFeel: '' }, style: '', background: '', exclude: [], warnings: [], developed: [], ...o })

/** a kit world on disk whose Bible carries `brief`, a take with `samples`, and (optionally) a cast card playing the performer */
function briefWorld(o: { brief: SceneBriefV2; bible: Partial<BibleRecord>; card?: { id: string; name: string; description: string }; take: Partial<TakeRecord> }) {
  const pub = path.join(mkdtempSync(path.join(tmpdir(), 'brief-')), 'public')
  const k = new KitStore(pub).create({ plan: { ...BATTLEFIELD, sentence: 'Set in a place, no people.' }, perf: { path: [[0, -6], [0, -4]], ...(o.card ? { castId: o.card.id } : {}) }, description: 'a place' })
  const f = path.join(pub, ...biblePaths(k.id).file.split('/'))
  mkdirSync(path.dirname(f), { recursive: true })
  writeFileSync(f, JSON.stringify({ ...bible({ worldId: k.id, ...o.bible }), brief: o.brief }))
  const p = emptyProject(DEFAULT_PROJECT, 'P', '2026-10-20T00:00:00.000Z')
  if (o.card) {
    const ref = '/lab-assets/cast/x/front.png'
    mkdirSync(path.dirname(path.join(pub, ref)), { recursive: true }); writeFileSync(path.join(pub, ref), 'img')
    p.ingredients.cast.push({ id: o.card.id, name: o.card.name, versions: [{ version: 1, created: 't', payload: { name: o.card.name, description: o.card.description, references: [ref, ref], sheets: [] } }] })
  }
  mkdirSync(path.join(pub, 'lab-assets', 'projects', DEFAULT_PROJECT), { recursive: true })
  writeFileSync(path.join(pub, 'lab-assets', 'projects', DEFAULT_PROJECT, 'project.json'), JSON.stringify(p))
  return { pub, brief: o.brief, take: { id: 'take-b', worldId: k.id, packId: null, fps: 24, frames: 97, focal: 24, viewAspect: 0.75, ...o.take } as TakeRecord }
}
const sentencesBefore = (p: string, marker: string) => p.slice(0, p.indexOf(marker)).split(/(?<=[.!?])\s+/).filter(Boolean).length

describe('the default Render prompt from a v2 brief', () => {
  // updated deliberately (stage-only plan, section 5): the brief's fields write the prompt only when the scene has no words, and
  // the person is their who-phrase (the card's whole first sentence), never a clause cut at a comma
  it('a rustic, person-led take with no scene words: her beats in order, the place, the air in motion, the light behind her', async () => {
    const w = briefWorld({
      card: { id: 'keep', name: 'Keeper', description: 'An old woman in her seventies, grey hair under a straw hat, a cotton smock, leather gloves.' },
      bible: { prompt: '', elements: [
        { tag: 'keeper', kind: 'cast', cardId: 'keep', refs: [], line: '' }, { tag: 'frame', kind: 'prop', refs: [], line: 'a wooden frame of comb' },
        { tag: 'hive', kind: 'prop', refs: [], line: 'a painted wooden hive' }, { tag: 'bees', kind: 'extras', refs: [], line: 'honeybees' }] },
      brief: briefV2({
        logline: '@keeper lifts @frame from @hive in an old orchard.',
        place: { setting: 'an old apple orchard', period: '', season: 'autumn', time: 'late afternoon', weather: '' },
        light: light({ key: 'low late-afternoon sun', direction: 'behind her, towards camera', height: 'low', quality: 'hard', colour: 'warm gold', effect: 'rims her hair and glows through the comb' }),
        atmosphere: [{ what: 'bees', where: 'around her hands and the hive' }],
        elements: [elV2('Keeper', 'keeper', 'person', 'off-white cotton smock, a straw hat with a mesh veil'), elV2('Honeycomb frame', 'frame', 'prop', 'waxy golden comb in a pine frame'),
          elV2('Hive', 'hive', 'prop', 'white-painted pine boxes, a tin roof'), elV2('Bees', 'bees', 'group')],
        beats: [{ who: '@keeper', does: 'lifts @frame out of @hive', seconds: 2, visible: 'squinting into the sun' }, { who: '@keeper', does: 'holds it up to the light', seconds: 2, visible: '' },
          { who: '@keeper', does: 'slides it back', seconds: 2, visible: '' }],
      }),
      take: { action: 'She lifts a honeycomb frame out of the hive.', samples: samples(97, 4, (k) => ({ pos: [0, 0.2, 0], yaw: -30 * k })) },
    })
    const p = await defaultPrompt(w.pub, w.take)
    expect(p).toMatch(/^An old woman in her seventies, grey hair under a straw hat, a cotton smock, leather gloves lifts the honeycomb frame out of the hive, then holds it up to the light, in an old apple orchard\. /)
    expect(p).not.toMatch(/slides it back/) // a 4 s take holds two beats
    expect(p).toContain('Bees moving around her hands and the hive.')
    // F4: the look in short phrases (its own sentence now): the light, one time word, two materials of at most six words
    expect(p).toContain('Low late-afternoon sun, behind her, towards camera, hard light, warm gold, rims her hair and glows through the comb; late afternoon; the keeper in off-white cotton smock, a straw hat; the honeycomb frame in waxy golden comb in a pine.')
    expect(warnPrompt(p, { step: 'render', brief: w.brief }).map((x) => x.code)).not.toContain('length')
    expect(p).not.toMatch(/as the driver|Match the first frame|Photoreal|camera pans/)
    expect(sentencesBefore(p, 'Low late-afternoon')).toBeLessThanOrEqual(2)
    expect(p).not.toMatch(/Set in|Cast:|Materials:|no people|cinematic|weathered/i)
  })
  it('a sleek take with nobody in it: the glass tower, its own materials and the brief style; no age, no people, no pan', async () => {
    const w = briefWorld({
      bible: { prompt: '', elements: [{ tag: 'tower', kind: 'prop', refs: [], line: 'a glass tower' }] },
      brief: briefV2({
        place: { setting: 'a glass office tower above a river', period: 'present day', season: '', time: 'early morning', weather: 'clear' },
        light: light({ key: 'clear morning sun', direction: 'the left of frame', height: 'high', quality: 'hard', effect: 'a bright flare running along the glass' }),
        atmosphere: [{ what: 'thin cloud', where: 'drifting past the upper floors' }],
        elements: [elV2('Tower', 'tower', 'prop', 'blue glass curtain wall and brushed aluminium mullions', 'new')],
        style: 'clean commercial look',
      }),
      take: { action: '', frames: 121, samples: samples(121, 5, (k) => ({ pos: [0, 30 + 25 * k, 40 - 20 * k], pitch: -20 })) },
    })
    const p = await defaultPrompt(w.pub, w.take)
    expect(p).toMatch(/^A glass office tower above a river\. Thin cloud drifting past the upper floors\. /)
    expect(p).toContain('the tower in blue glass curtain wall and brushed, new')
    expect(warnPrompt(p, { step: 'render', brief: w.brief }).map((x) => x.code)).not.toContain('length')
    expect(p).toMatch(/ Clean commercial look\.$/)
    expect(p).not.toMatch(/pans|camera|people|person|weathered|aged|worn|rust|Photoreal|as the driver/i)
    expect(sentencesBefore(p, 'Clear morning sun')).toBeLessThanOrEqual(2)
  })
  it('the camera is never described, still or moving or without samples', async () => {
    const base = { bible: { prompt: '' }, brief: briefV2({ place: { setting: 'a quiet street', period: '', season: '', time: '', weather: '' } }) }
    const still = briefWorld({ ...base, take: { samples: samples(49, 2, () => ({ pos: [0, 1.6, 0] })) } })
    expect(await defaultPrompt(still.pub, still.take)).toMatch(/^A quiet street\.$/)
    const none = briefWorld({ ...base, take: { samples: [] } })
    expect(await defaultPrompt(none.pub, none.take)).toMatch(/^A quiet street\.$/)
  })
})

describe('the owner\'s race take (owner 10-29: the words go as written; nothing added unseen)', () => {
  const DRIVER = "A race car driver with a full face helmet and red reflective visor obscuring his face. He's dressed in black and red leather race suit with black boots and red gloves."
  const CAR = 'An open-wheel single-seater race car with wide slick tyres, a tall rear wing and an open cockpit.'
  const WORDS = 'A low-angle tracking shot on a rain-soaked circuit at night. @driver, in a dark racing suit and helmet, walks steadily toward @car2 , boots splashing through shallow puddles, and stops beside it. Heavy rain falls.'
  it('a flown arc adds no camera line; each tag is its card once, where typed; no "the car2", no "as the driver", no "Photoreal"', async () => {
    const w = briefWorld({
      card: { id: 'drv', name: 'Driver', description: DRIVER },
      bible: { prompt: WORDS, elements: [{ tag: 'driver', kind: 'cast', cardId: 'drv', refs: [], line: DRIVER }, { tag: 'car2', kind: 'prop', refs: [], line: CAR }] },
      brief: briefV2({}),
      // forward and to the right while turning left: the arc the old camera line called "pushes in and pans left"
      take: { action: '', samples: samples(9, 4, (k) => ({ pos: [1.9 * k, 0.4, -2.5 * k], yaw: -0.5 * k })) },
    })
    const p = await defaultPrompt(w.pub, w.take)
    expect(p).toBe('A low-angle tracking shot on a rain-soaked circuit at night. A race car driver with a full face helmet and red reflective visor obscuring his face, in a dark racing suit and helmet, '
      + 'walks steadily toward an open-wheel single-seater race car with wide slick tyres, a tall rear wing and an open cockpit, boots splashing through shallow puddles, and stops beside it. '
      + "He's dressed in black and red leather race suit with black boots and red gloves. Heavy rain falls.")
    expect(p).not.toMatch(/the camera (pushes|pans|tracks|holds)|wide shot|the car2|as the driver|Match the first frame|Photoreal/)
  })
})
