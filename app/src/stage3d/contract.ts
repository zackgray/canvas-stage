/**
 * Stage3D contract (overnight wave 0, 2026-10-23): the real-geometry world and performer that replace the panorama world and the
 * video-lifted performer. Both the E114 spike page and the studio build against these types. Fields are only ever added, never renamed.
 *
 * Units: metres, seconds. Axes: x right, y up, z toward the master camera (negative z is "ahead"). Yaw in degrees, 0 = facing +z.
 */

/** one placed kit piece; `kind` must be a key of KIT (kit.ts) and `args` that builder's arguments */
export type KitItem = {
  kind: string; args?: number[]; at: [number, number]; yawDeg?: number; scale?: number; lift?: number
  /**
   * (prop-movement wave, 2026-10-28) the piece's base tilt in degrees, applied after its turn, each about the model's own axes:
   * pitch about its own x, roll about its own z. 0 = upright. Squares up a generated mesh that came in slightly off axis; a piece
   * that also travels keeps this base orientation under the travel heading (propMove.ts).
   */
  pitchDeg?: number; rollDeg?: number
  /** (prop-movement wave) the piece's travel over the take's timeline; `at` stays its resting place (the path's start) */
  move?: PieceMove
  /** appended by track P: true = the piece may stand in the performer's walk corridor (`flat`); validator skips the corridor check */
  walkThrough?: boolean
  /**
   * (recipe wave, 2026-10-24) a generated set piece (TRELLIS.2 shape-only, E136/E137): the mesh comes from `glb` instead of KIT[kind],
   * placed at `at`/`yawDeg`/`scale`/`lift` like any kit piece. `kind` stays a plain noun for the prompts (it need not be a KIT key).
   */
  glb?: GlbPiece
  /** (recipe wave) the piece's own ID-pass class, 'prop:<tag>' (EntityTag): one colour per piece so a mask can cut it out */
  pieceTag?: string
  /**
   * (prompt wave, 2026-10-25) the brief's own words for this piece ("apple trees heavy with fruit"); prompts name a piece by its label,
   * never by its kit kind. Relief kinds (mound, rock) carry none and are never named.
   */
  label?: string
}

/** (prop-movement wave) a piece's travel: a drawn ground path it follows at `speed` metres per second from the take's start,
 *  holding at the path's end; `faceTravel` unset (default) turns it to face the way it travels, on top of its base turn */
export type PieceMove = { path: [number, number][]; speed: number; faceTravel?: boolean }

/** (recipe wave) a generated mesh as the set uses it; E136: TRELLIS.2 comes out unit-sized, facing -x */
export type GlbPiece = {
  /** the precise mesh: drives metric depth, the ID pass and the layout check */
  url: string
  /** the same piece voxelised to its big forms (E139 massing): drives the still's depth control and the L2R video; unset = url */
  massingUrl?: string
  /** degrees added to yawDeg so the piece faces +z (E136 found a fixed 90) */
  yawOffsetDeg?: number
  /** metres per mesh unit, so `scale` stays a multiplier on real size */
  unitScale?: number
  /** metres the piece is sunk below the ground (walk-on decks and platforms, E137) */
  sink?: number
}

/**
 * the far sky, at infinity: a panorama used only above the horizon cut, or (url = planRules DEFAULT_SKY, the default) a sky drawn
 * from the plan itself (sky.ts: time of day, weather, key light, fog; an interior gets an enclosed neutral backdrop)
 */
export type SkyPlan = {
  url: string
  /** (2026-10-24) a procedural sky's look; unset = read from the plan's sentence and light. Ignored by a pano sky. */
  look?: 'dawn' | 'noon' | 'dusk' | 'night' | 'overcast' | 'storm' | 'fog' | 'interior'
  yawDeg?: number
  /** degrees the pano's horizon is lifted (its own ground hidden) */
  horizonLiftDeg?: number
  gain?: number
  /** [u0, u1] horizontal band of the pano that is clean sky; mirrored ping-pong round the 360 */
  band?: [number, number]
  /** elevation (deg) below which the pano fades into the fog colour */
  cutDeg?: number
}

/** the world: what the in-app LLM fills from a sentence (validated by plan.ts) */
export type ScenePlan = {
  sentence?: string
  seed: number
  /** [x0, z0, x1, z1] corridor kept flat so feet sit on the ground */
  flat?: [number, number, number, number]
  /** the ground's shape (the Set panel's Ground row): 'flat' = level everywhere (tracks, floors, streets); 'rolling' = gentle rolls
   *  off the corridor. Unset = rolling, so a world made before the choice keeps its ground (and its takes); a new scene is flat */
  ground?: GroundKind
  groundShade?: number
  puddles?: number
  tufts?: number
  fog?: { color?: string; density?: number }
  /** fill/key intensity; keyDir = [yaw deg, elevation deg] of the key light */
  light?: { fill?: number; key?: number; keyDir?: [number, number] }
  sky: SkyPlan
  kit: KitItem[]
  /** (guided wave, Track C) where the hero starts: the Set's top view drags it, Blocking's new path begins there; unset = the start of the flat corridor (stage3d/mark.ts) */
  mark?: MarkPlan
}

export type GroundKind = 'flat' | 'rolling'

/** the subject's mark: a ground point [x, z] and the way they face (degrees, 0 = facing +z, toward the master camera) */
export type MarkPlan = { at: [number, number]; yawDeg?: number }

/**
 * an action placed on the path; `at` = metres along the path where it starts. (2026-10-25) 'lift': lift a frame from a hive with
 * both hands and hold it up (`seconds` = the hold); the hive and the frame come with the action (stage3d/props/liftProps.ts).
 * (track D, live motion) 'move': a made move kept as a user clip; `motion` = its id gen:<motion-id>, `toward` = the ground point
 * [x, z] of the set piece the move is about (playback turns her to face it first when it is off her facing; the lift rig builds no
 * second copy of the piece: motion/moveAction.ts, props/liftProps.ts).
 */
export type ActionKind = 'stop' | 'turn' | 'look' | 'idle' | 'kneel' | 'lift' | 'move'
export type PathAction = { kind: ActionKind; at: number; seconds?: number; /** turn/look: degrees, + = to his left */ deg?: number
  /** (track D) a made move's clip id, gen:<motion-id> (a kept user clip under public/lab-assets/motions/<motion-id>/) */
  motion?: `gen:${string}`
  /** (track D) the ground point [x, z] of the set piece the move is about, when it names one */
  toward?: [number, number] }

/** the performance: a drawn ground path with actions on it, played by clips from the library */
export type PerformancePlan = {
  /** ground points [x, z], at least two; the performer walks them in order */
  path: [number, number][]
  actions?: PathAction[]
  /** walk speed multiplier on the clip's natural pace (0.8 = a heavy stride) */
  pace?: number
  /** 'walk' | 'run' gait for the travelling parts */
  gait?: 'walk' | 'run'
  /** (track M) radius in metres of the walking turn at corners without a stop; default 1.2, shrunk to fit short legs */
  turnRadius?: number
  /** kept for the old files (they hold 'soldier', 'plain', 'modern', 'coat' or 'gown'): read and kept as it is, never written by
   *  new code, and nothing reads it for the look (every figure is the one neutral mannequin, mannequin.ts) */
  costume?: 'soldier' | 'plain' | 'modern' | 'coat' | 'gown'
  /** (2026-10-24 limits test) creatures that act on the same clock, e.g. a dragon rearing up and roaring at a ground point */
  creatures?: CreaturePlan[]
  /** (Wave 0.5; built by track E1) background figures on their own paths and the same clock as the hero */
  extras?: ExtraPlan[]
  /**
   * (wave A, W0) true = the hero stands at the mark for the take: `path` is then the mark plus a 0.2 m stub along the mark's facing
   * (motion/standPlan.ts standPath), and the motion is a stand, not a walk (standPlan). Unset = walks the path, as before.
   */
  stand?: boolean
  /**
   * (wave A, W0) the shot's one length in seconds, 2 to 8 (a render keeps at most 8 s, 193 frames). Set: the motion is padded to
   * reach it (motion/shotPad.ts). Unset = no pad: the take lasts exactly as long as its motion, as before.
   */
  shotSeconds?: number
  /**
   * (2026-10-29) true = a leg that ends in a stop starts its stride at the phase that lands it cleanly on the stop clip
   * (motion/strideFit.ts). Stamped by the server when the walk changes (server/stage3d/strideFitStamp.ts); unset = the walk starts
   * at phase 0, as every take locked before did, so those keep their frames.
   */
  strideFit?: boolean
  /**
   * (2026-10-29) true = as a walk arrives, the upper body settles from the stop clip into the idle over 1.2 s instead of snapping in
   * the 0.4 s crossfade (motion/settle.ts). Stamped like strideFit; unset = the crossfade alone, as every take locked before had it.
   */
  softSettle?: boolean
}

/** (wave A, W0) the shot length's bounds, seconds (contract PerformancePlan.shotSeconds; checked by server/stage3d/perf.ts) */
export const SHOT_SECONDS_MIN = 2
export const SHOT_SECONDS_MAX = 8

/**
 * (Wave 0.5) one background figure: walks `path` from `delay` seconds after the take's start, in the given gait and costume.
 * `variant` indexes the Bible's extras sheet (bibleContract BibleExtrasSheet); `tag` binds it to a Bible element (no '@').
 */
/** the costume every extra new code writes: a constant the old parser accepts (server/stage3d/perf.ts requires one of three) */
export const EXTRA_COSTUME = 'modern' as const

export type ExtraPlan = {
  path: [number, number][]
  gait: 'walk' | 'run'
  delay: number
  /** kept for the old files: the old parser requires one of these three, so every extra written carries EXTRA_COSTUME; an old
   *  file's 'soldier' or 'plain' is read and kept as it is. Nothing reads it for the look (every figure is the neutral mannequin). */
  costume: 'soldier' | 'plain' | 'modern'
  variant: number
  tag?: string
  /** (recipe wave) true = the figure stands at path[0] on the idle clip for the whole take (no walk, so no lurch on a short path) */
  stand?: boolean
  /** (recipe wave) ground point [x, z] a standing figure faces; unset = the hero's start */
  face?: [number, number]
  /** (recipe wave) actions on the extra's own path or stand, same kinds and meaning as the hero's ('look' is the common one) */
  actions?: PathAction[]
}

/** the one creature kind the kit animates (the server's performance check allows only it); the Stage's copy names it from here */
export const CREATURE_KIND = 'dragon' as const
/** a creature on the performance's clock; `at` = ground point [x, z], yawDeg = its facing (0 = +z) */
export type CreaturePlan = { kind: typeof CREATURE_KIND; action: 'roar'; at: [number, number]; yawDeg?: number; scale?: number }

/**
 * (Wave 0.5) what every performer, extra, creature and prop carries as `object.userData.entity`, so the ID pass (track E2) can
 * colour it by class: 'hero', 'extra:<index in extras>:<variant>', 'creature:<tag>', 'prop:<tag>'. Untagged meshes are the world.
 */
export type EntityTag = 'hero' | `extra:${number}:${number}` | `creature:${string}` | `prop:${string}`
/** an EntityTag as text; tags are a Bible element's (bibleContract BIBLE_TAG_RE without the '@') */
export const ENTITY_TAG_RE = /^(hero|extra:\d+:\d+|creature:[a-z][a-z0-9_-]{0,31}|prop:[a-z][a-z0-9_-]{0,31})$/

/** a posed performer the stage renders; poseAt is deterministic in t */
export interface Performer3D {
  /** add this to the scene once */
  readonly object: import('three').Object3D
  /** seconds the performance lasts */
  readonly duration: number
  /** pose the figure at time t (clamped to [0, duration]) */
  poseAt(t: number): void
  /** the smooth path point (no sway) at time t, on the ground; cameras follow this */
  anchorAt(t: number): import('three').Vector3
  /** heading (unit xz vector) at time t */
  headingAt(t: number): import('three').Vector3
}

/** a built world */
export interface World3D {
  readonly scene: import('three').Scene
  /** ground height at (x, z) */
  groundAt(x: number, z: number): number
  /** call once the sky texture has loaded (captures must wait for it) */
  readonly ready: Promise<void>
  /**
   * (fix pass, 2026-10-23) free everything this world put on the GPU: its geometries, its own materials and their textures (the
   * sky dome's), the lights (the key's shadow map) and the tufts InstancedMesh, wherever the objects have since been moved (the
   * lab's KitLayer re-parents them). The kit's shared module-level materials are left for other worlds. Call once, when leaving.
   */
  dispose(): void
}
