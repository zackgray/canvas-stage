// Fix wave 2026-10-24 (T1a): no plan defaults to the old battlefield panorama. The default sky is drawn from the plan (time of day,
// weather, key light); an interior gets an enclosed neutral backdrop; a pano is used only when a plan names one.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { checkPlanText } from '../../../server/planner/planText.ts'
import type { ScenePlan } from '../contract.ts'
import { parsePlan, repairPlan } from '../plan.ts'
import { DEFAULT_SKY } from '../planRules.ts'
import { BATTLEFIELD, PLANS } from '../presets.ts'
import { isInterior, isPanoSky, skyLook, skyParams } from '../sky.ts'
import { buildWorld } from '../world.ts'

const OLD_PANO = 'loc-2026-10-23T16-13-07-001'
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = path.resolve(HERE, '..')
const plan = (sentence: string, extra: Partial<ScenePlan> = {}): ScenePlan => ({ seed: 1, sentence, sky: { url: DEFAULT_SKY }, kit: [], ...extra })

/** the sentences the five fresh-concept QA runs' planner wrote (2026-10-24), trimmed */
const QA = {
  canyon: 'Harsh noon in a dry canyon. girl and boy race across the dusty ground toward a rusted water_tank.',
  jazz: 'Dusk in a smoky, dimly lit club interior. singer stands center stage, wearing a sequinned gown.',
  railway: 'Dawn breaks over a desolate, snowy mountain platform. conductor, in a heavy uniform, assists traveller.',
  market: 'Night in a muddy, rain-slicked market square. courier weaves on foot between the stalls.',
  lighthouse: "Set in A lighthouse keeper's cramped lamp room during a night storm. Cold blue-black darkness outside, the lamp's warm glow inside.",
  forest: 'Dusk settles over a muddy forest track, the air thick with dampness. Mist curls low around the gnarled roots.',
}

describe('the default sky is drawn, not the battlefield pano', () => {
  it('DEFAULT_SKY names no panorama file and reads as the drawn sky', () => {
    expect(DEFAULT_SKY).not.toContain(OLD_PANO)
    expect(DEFAULT_SKY).not.toMatch(/\.(png|jpe?g|webp|exr|hdr)$/i)
    expect(isPanoSky({ url: DEFAULT_SKY })).toBe(false)
    expect(parsePlan(plan('a field')).ok).toBe(true)
  })

  it('a plan with no usable sky is repaired onto the drawn sky', () => {
    for (const sky of [undefined, {}, { url: 'https://x/y.png' }]) expect(repairPlan({ seed: 1, sky, kit: [] }).plan.sky.url).toBe(DEFAULT_SKY)
  })

  it('the planner path (its constant sky filled in) lands on the drawn sky', () => {
    const r = checkPlanText('{"seed":3,"sky":{"gain":1,"cutDeg":10},"kit":[]}', QA.market)
    expect(r.ok && r.plan.sky.url).toBe(DEFAULT_SKY)
  })

  it('no stage3d source or preset outside the battlefield fixture names the old pano', () => {
    const files: string[] = []
    const walk = (d: string) => { for (const n of readdirSync(d)) { const f = path.join(d, n); if (statSync(f).isDirectory()) { if (n !== '__tests__') walk(f) } else files.push(f) } }
    walk(SRC)
    const naming = files.filter((f) => readFileSync(f, 'utf8').includes(OLD_PANO)).map((f) => path.relative(SRC, f).replace(/\\/g, '/'))
    expect(naming).toEqual(['plans/battlefield.json'])
    for (const p of Object.values(PLANS)) expect(isPanoSky(p.sky)).toBe(false)
  })

  it('a plan that names a pano keeps it', () => {
    expect(isPanoSky(BATTLEFIELD.sky)).toBe(true)
    expect(repairPlan(BATTLEFIELD).plan.sky.url).toBe(BATTLEFIELD.sky.url)
  })
})

describe('what the drawn sky reads from the plan', () => {
  it('time of day and weather from the QA sentences', () => {
    expect(skyLook(plan(QA.canyon))).toEqual({ time: 'noon', weather: 'clear', interior: false })
    expect(skyLook(plan(QA.railway))).toEqual({ time: 'dawn', weather: 'overcast', interior: false })
    expect(skyLook(plan(QA.market))).toEqual({ time: 'night', weather: 'overcast', interior: false })
    expect(skyLook(plan(QA.forest))).toEqual({ time: 'dusk', weather: 'fog', interior: false })
    // the time it is set at beats a time word used as a name (m-7)
    expect(skyLook(plan('A night market at dawn')).time).toBe('dawn')
    expect(skyLook(plan('The morning train pulls out during the night')).time).toBe('night')
  })

  it('a scene set inside gets the enclosed backdrop: no sun, no horizon band', () => {
    for (const s of [QA.jazz, QA.lighthouse, 'A quiet office at night', 'Inside the old mill']) expect(isInterior(s)).toBe(true)
    for (const s of [QA.canyon, QA.market, QA.railway, 'Outside the club, a queue in the rain', 'A flat field at noon']) expect(isInterior(s)).toBe(false)
    // a room word qualifying an outdoor place, or a figure of speech, is not a room (m-7)
    for (const s of ['the golf club lawn at noon', 'a bar of sunlight across the field', 'the club car park after rain']) expect(isInterior(s)).toBe(false)
    const p = skyParams(plan(QA.jazz))
    expect(p.sunSize).toBe(0); expect(p.glow).toBe(0); expect(p.haze).toBe(0)
  })

  it('with no words, the key light decides; sky.look overrides everything', () => {
    expect(skyLook(plan('', { light: { key: 0.3, keyDir: [200, 28] } })).time).toBe('night')
    expect(skyLook(plan('', { light: { keyDir: [140, 8] } })).time).toBe('dusk')
    expect(skyLook(plan('', { light: { keyDir: [140, 45] } })).time).toBe('noon')
    expect(skyLook(plan(QA.jazz, { sky: { url: DEFAULT_SKY, look: 'storm' } }))).toMatchObject({ weather: 'storm', interior: false })
    expect(skyLook(plan(QA.canyon, { sky: { url: DEFAULT_SKY, look: 'interior' } })).interior).toBe(true)
  })

  it('the sun sits on the one default light\'s bearing, whatever the plan\'s keyDir says, and night is darker than noon', () => {
    const p = skyParams(plan('noon', { light: { keyDir: [90, 30] } }))
    const q = skyParams(plan('noon'))
    expect(p.sunDir).toEqual(q.sunDir) // the planner's sun no longer moves the disc: both read the default light
    expect(Math.atan2(p.sunDir[0], -p.sunDir[2])).toBeCloseTo((150 * Math.PI) / 180, 5)
    const lum = (h: string) => new THREE.Color(h).getHSL({ h: 0, s: 0, l: 0 }).l
    expect(lum(skyParams(plan('night')).zenith)).toBeLessThan(lum(skyParams(plan('noon')).zenith))
  })

  it('sky.look is checked and kept by repair', () => {
    expect(parsePlan(plan('x', { sky: { url: DEFAULT_SKY, look: 'dusk' } })).ok).toBe(true)
    const bad = parsePlan({ ...plan('x'), sky: { url: DEFAULT_SKY, look: 'sunny' } })
    expect(bad.ok ? '' : bad.errors.join()).toMatch(/sky\.look: must be one of/)
    expect(repairPlan({ seed: 1, sky: { url: DEFAULT_SKY, look: 'night' }, kit: [] }).plan.sky.look).toBe('night')
    expect(repairPlan({ seed: 1, sky: { url: DEFAULT_SKY, look: 'sunny' }, kit: [] }).plan.sky.look).toBeUndefined()
  })
})

describe('the built world', () => {
  const skyOf = (w: ReturnType<typeof buildWorld>) => w.scene.children.find((k) => (k as THREE.Mesh).isMesh && k.renderOrder < 0) as THREE.Mesh
  it('draws the sky in its dome (no texture, ready at once), where the stage looks for it', async () => {
    const w = buildWorld(PLANS['country-road-dusk']), sky = skyOf(w)
    expect(sky.geometry.type).toBe('SphereGeometry')
    const u = (sky.material as THREE.ShaderMaterial).uniforms
    expect(u.map).toBeUndefined(); expect(sky.userData.skyKind).toBe('procedural')
    await expect(Promise.race([w.ready.then(() => 'ready'), new Promise((r) => setTimeout(() => r('waiting'), 50))])).resolves.toBe('ready')
    w.dispose()
  })
  it('an interior plan gets the enclosed backdrop', () => {
    const inside = buildWorld({ ...PLANS['open-field-day'], sentence: QA.jazz })
    expect(skyOf(inside).userData.skyKind).toBe('interior'); inside.dispose()
  })
})
