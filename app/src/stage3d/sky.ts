// Stage3D procedural sky: what a plan gets unless it names a panorama (planRules DEFAULT_SKY). A gradient from horizon to zenith,
// a sun or moon disc on the one default light's bearing, cloud cover and haze, all from what the plan already says: its
// sentence's time of day and weather words, else its key light. A scene set inside (a room, a club, a lamp room) gets an
// enclosed, even, dark backdrop with no horizon and no sun until the kit has room shells. No image, no network, no paid step. skyLook/skyParams are pure.
import * as THREE from 'three'
import type { ScenePlan, SkyPlan } from './contract.ts'
import { DEFAULT_SKY, DEFAULT_KEY_DIR } from './planRules.ts'

export type SkyLook = NonNullable<SkyPlan['look']>
// lateDay: a low, warm, not yet red sun (late afternoon, golden hour); between noon and dusk, never set by sky.look
export type SkyTime = 'dawn' | 'noon' | 'lateDay' | 'dusk' | 'night'
export type SkyWeather = 'clear' | 'overcast' | 'storm' | 'fog'

/** true when the plan's sky is a panorama file (an explicit choice); false for the drawn sky */
export const isPanoSky = (sky: SkyPlan): boolean => sky.url !== DEFAULT_SKY && !sky.url.startsWith('/lab-assets/sky/')

const INSIDE = /\b(inside|indoors?|interior)\b/i
const OUTSIDE = /\b(outside|outdoors?|open air|exterior)\b/i
// a room noun naming the place, not one qualifying an outdoor one ("the golf club lawn") or a figure of speech ("a bar of sunlight")
const ROOM = /\b(room|club|bar(?!\s+of\b)|pub|tavern|saloon|hall|ballroom|lobby|corridor|hallway|cellar|basement|attic|kitchen|bedroom|office|apartment|studio|theat(?:re|er)|restaurant|café|cafe|diner)\b(?!\s+(?:lawns?|grounds|gardens?|terraces?|yards?|car ?parks?|parking|courses?|fields?|steps|roofs?|forecourts?|patios?)\b)/i
const TIMES: [SkyTime, RegExp][] = [
  ['night', /\b(night|midnight|moon(?:lit|light)?|starlit|stars|after dark)\b/i],
  // before dusk and noon so that on a tie ("evening light", "sunset light") the specific phrase beats the bare word; "afternoon" alone stays noon
  ['lateDay', /\b(late afternoon|golden hour|low sun|evening light|sunset light|backlit)\b/i],
  ['dusk', /\b(dusk|sunset|sundown|evening|twilight|gloaming)\b/i],
  ['dawn', /\b(dawn|sunrise|daybreak|first light|morning)\b/i],
  ['noon', /\b(noon|midday|afternoon|daylight|daytime|sunlit|sunny|bright day|day)\b/i],
]
const WEATHERS: [SkyWeather, RegExp][] = [
  ['storm', /\b(storm(?:y)?|thunder(?:storm)?|lightning|gale|tempest|blizzard)\b/i],
  ['fog', /\b(fog(?:gy)?|mist(?:y)?|haze|hazy)\b/i],
  ['overcast', /\b(overcast|cloudy|grey sky|gray sky|rain(?:y|ing)?|drizzle|rain-slicked|snow(?:y|ing)?|sleet|bleak)\b/i],
]

/** the earliest-named entry whose words the text uses */
function first<T>(text: string, table: [T, RegExp][]): T | null {
  let best: T | null = null, at = Infinity
  for (const [k, re] of table) { const m = re.exec(text); if (m && m.index < at) { best = k; at = m.index } }
  return best
}

/** "at dawn", "during the night", "by early evening": a time the scene is set AT, which beats a time word used as a name */
const AT_TIME = String.raw`\b(?:at|by|in the|during|toward|towards|around)\s+(?:the\s+|an?\s+)?(?:early\s+|late\s+|deep\s+|high\s+)?`
const AT_TIMES: [SkyTime, RegExp][] = TIMES.map(([k, re]) => [k, new RegExp(AT_TIME + re.source, 'i')])
/** the sentence's time of day: a time it is set at first ("a night market at dawn" is dawn), else the earliest time word */
const timeOf = (text: string): SkyTime | null => first(text, AT_TIMES) ?? first(text, TIMES)

/** true when the scene is set inside: it says so, or names a room and does not say it is outside */
export function isInterior(sentence: string): boolean {
  return INSIDE.test(sentence) || (!OUTSIDE.test(sentence) && ROOM.test(sentence))
}

/** time and weather of a plan's drawn sky: sky.look when set, else the sentence's words, else the key light */
export function skyLook(plan: Pick<ScenePlan, 'sentence' | 'light' | 'sky'>): { time: SkyTime; weather: SkyWeather; interior: boolean } {
  const look = plan.sky.look, text = plan.sentence ?? ''
  if (look === 'interior') return { time: 'noon', weather: 'clear', interior: true }
  const lookTime = look === 'dawn' || look === 'noon' || look === 'dusk' || look === 'night' ? look : null
  const lookWeather = look === 'overcast' || look === 'storm' || look === 'fog' ? look : null
  const interior = !look && isInterior(text)
  const [, elev] = plan.light?.keyDir ?? [150, 12], key = plan.light?.key ?? 1.6
  const lit: SkyTime = key < 0.5 ? 'night' : elev < 14 ? 'dusk' : 'noon'
  return { time: lookTime ?? timeOf(text) ?? lit, weather: lookWeather ?? first(text, WEATHERS) ?? 'clear', interior }
}

export interface SkyParams { zenith: string; horizon: string; sun: string; sunDir: [number, number, number]; sunSize: number; glow: number; cover: number; haze: number; dim: number }

const PALETTE: Record<SkyTime, { zenith: string; horizon: string; sun: string; elev: number; size: number; glow: number }> = {
  dawn: { zenith: '#6c7f9e', horizon: '#e4b38e', sun: '#ffd8a8', elev: 6, size: 0.022, glow: 0.55 },
  noon: { zenith: '#4c7cbf', horizon: '#bcd0e6', sun: '#fff7e6', elev: 50, size: 0.02, glow: 0.35 },
  lateDay: { zenith: '#5a80b4', horizon: '#e6c595', sun: '#ffdca6', elev: 12, size: 0.024, glow: 0.5 },
  dusk: { zenith: '#36426a', horizon: '#d98c66', sun: '#ffb070', elev: 4, size: 0.026, glow: 0.7 },
  night: { zenith: '#04060c', horizon: '#161c2a', sun: '#c9d3e8', elev: 30, size: 0.012, glow: 0.12 },
}
const WEATHER: Record<SkyWeather, { cover: number; haze: number; dim: number }> = {
  clear: { cover: 0, haze: 0.3, dim: 1 },
  overcast: { cover: 0.85, haze: 0.55, dim: 0.85 },
  storm: { cover: 1, haze: 0.65, dim: 0.5 },
  fog: { cover: 0.75, haze: 1, dim: 0.95 },
}
/** the enclosed backdrop of an interior: even, dark, neutral; no sun, no horizon band */
const INTERIOR: SkyParams = { zenith: '#1c1b1a', horizon: '#2a2826', sun: '#000000', sunDir: [0, 1, 0], sunSize: 0, glow: 0, cover: 1, haze: 0, dim: 1 }

/** the uniforms of a plan's drawn sky (pure): palette by time, cover and haze by weather, the disc on the default light's bearing */
export function skyParams(plan: Pick<ScenePlan, 'sentence' | 'light' | 'sky'>): SkyParams {
  const { time, weather, interior } = skyLook(plan)
  if (interior) return INTERIOR
  const p = PALETTE[time], w = WEATHER[weather]
  // the disc sits on the one default light's bearing (world.ts places the key at DEFAULT_KEY_DIR, [150, 12]); its height
  // is the time's. The planner's sun is gone: the plan's keyDir no longer moves the disc.
  const y = (DEFAULT_KEY_DIR[0] * Math.PI) / 180, e = (p.elev * Math.PI) / 180
  return { zenith: p.zenith, horizon: p.horizon, sun: p.sun, sunDir: [Math.sin(y) * Math.cos(e), Math.sin(e), -Math.cos(y) * Math.cos(e)],
    sunSize: p.size, glow: p.glow, cover: w.cover, haze: w.haze, dim: w.dim * (plan.sky.gain ?? 1) }
}

const FRAG = `uniform vec3 zen, hor, sunc, fogc, sunDir; uniform float sunSize, glow, cover, haze, dim, grey; varying vec3 vd;
  void main(){ vec3 d = normalize(vd); float el = d.y;
    vec3 c = mix(hor, zen, pow(clamp(el, 0., 1.), 0.5));
    c = mix(c, vec3(dot(c, vec3(.2126,.7152,.0722))) * 0.95 + fogc * 0.15, cover);
    c = mix(c, fogc, haze * (1. - smoothstep(0., 0.3, el)));
    c *= dim;
    c = mix(fogc, c, smoothstep(-0.03, 0.02, el));
    // the sun is added last, out of the haze, dim and horizon fade: whatever the weather it stays the brightest point
    float s = dot(d, normalize(sunDir));
    c += sunc * glow * pow(max(s, 0.), 12.) * (1. - cover * 0.85);
    c = mix(c, sunc, smoothstep(cos(sunSize), cos(sunSize * 0.7), s) * (1. - cover * 0.9) * step(0.0001, sunSize));
    if (grey > .5) c = vec3(dot(c, vec3(.2126,.7152,.0722)));
    gl_FragColor = vec4(c, 1.);
    #include <colorspace_fragment>
  }`
const VERT = 'varying vec3 vd; void main(){ vd = normalize((modelMatrix*vec4(position,1.)).xyz - cameraPosition); gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.); gl_Position.z = gl_Position.w; }'

/** the drawn sky dome (same shape and far-plane trick as the pano dome, so the stage finds it the same way); ready at once */
export function proceduralDome(plan: ScenePlan, fogColor: THREE.Color): THREE.Mesh {
  const p = skyParams(plan), col = (h: string) => new THREE.Color(h)
  // an interior's backdrop below the eye line is the backdrop too, not the fog colour of an open horizon
  const below = p === INTERIOR ? col(INTERIOR.horizon) : fogColor
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { zen: { value: col(p.zenith) }, hor: { value: col(p.horizon) }, sunc: { value: col(p.sun) }, fogc: { value: below }, sunDir: { value: new THREE.Vector3(...p.sunDir) },
      sunSize: { value: p.sunSize }, glow: { value: p.glow }, cover: { value: p.cover }, haze: { value: p.haze }, dim: { value: p.dim }, grey: { value: 1 } },
    vertexShader: VERT, fragmentShader: FRAG,
  })
  const m = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), mat); m.frustumCulled = false; m.renderOrder = -1
  m.userData.skyKind = p === INTERIOR ? 'interior' : 'procedural'
  return m
}
