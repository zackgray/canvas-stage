/**
 * The scene library contract: scenes as first-class documents, each owning its draft, its sets (kit worlds) and, through them, its
 * takes, hero stills and renders; plus the per-scene record of every paid job in flight. Server: server/scene/library*.ts and
 * server/scene/jobRecords.ts. Client: src/library/ and src/jobs/. Fields are only ever added. Pure (no DOM, no node).
 *
 * Ownership rules (decided 2026-10-25):
 *  - A scene owns its draft (lab-assets/scene/<sceneId>/draft/, keyed by the scene id) and the list of worlds built from it.
 *  - A world belongs to the one scene that built it (attached when the world is written, never moved). Rebuilding the set adds a
 *    new world to the list and makes it the current one; the older worlds stay in the list, so their takes stay reachable.
 *  - Takes belong to a world (TakeRecord.worldId); hero stills and renders belong to a take. So everything filmed is reachable from
 *    exactly one scene: scene -> worlds[] -> takes -> stills / renders.
 *  - "Remove from list" hides a scene; nothing on disk is deleted.
 *  - Every write of a scene document or its draft carries the revision it was read at; a stale one is refused with 409.
 */

export const LIBRARY_ROUTES = { scenes: '/__lab/scenes' } as const
/**
 * GET  /__lab/scenes                         -> SceneSummary[] (hidden ones left out; ?hidden=1 lists them too), last edited first
 * POST /__lab/scenes                         { name? } -> SceneView (a new, empty scene)
 * GET  /__lab/scenes/<id>                    -> SceneView (404 when absent)
 * POST /__lab/scenes/<id>/rename             { name, revision } -> SceneView (409 stale revision)
 * POST /__lab/scenes/<id>/remove             { revision } -> SceneView (hidden: off the list; files kept)
 * POST /__lab/scenes/<id>/world              { worldId, revision } -> SceneView (one of its own worlds becomes the current set)
 * GET  /__lab/scenes/<id>/jobs               -> { jobs: SceneJobRecord[] } (paid jobs sent for this scene and not yet cleared)
 * GET  /__lab/scenes/<id>/jobs/<jobId>       -> SceneJobRecord (404 when absent or cleared)
 * POST /__lab/scenes/<id>/jobs/<jobId>/clear {} -> { cleared: boolean } (the first caller claims the result; later ones get false)
 * A world is attached by POST /__lab/stage3d/world { …, scene } (the server, in the same request that writes the world).
 */

/** `sc-<yyyymmddhhmmss>-<4>`; also a valid project id, so the draft routes take it as their `project` */
export const SCENE_ID_RE = /^sc-\d{14}-[a-z0-9]{4}$/
export const SCENE_NAME_MAX = 80
export const DEFAULT_SCENE_NAME = 'Untitled scene'

/** how far a scene has got, in the order of the stepper (Export is not tracked per scene) */
export const SCENE_STAGES = ['brief', 'board', 'set', 'shoot', 'render'] as const
export type SceneStageReached = (typeof SCENE_STAGES)[number]

export interface SceneWorld {
  /** the kit world's location id (loc-…) */
  id: string
  builtAt: string
  /** the brief's fingerprint when the set was built from it (null until the draft moved into the world's Bible) */
  brief: string | null
}

/** The stored document: public/lab-assets/scene/<id>/scene.json */
export interface SceneDoc {
  id: string
  name: string
  revision: number
  hidden: boolean
  createdAt: string
  updatedAt: string
  /** the current set: one of `worlds`, or null before the first build */
  worldId: string | null
  /** every world built from this scene, oldest first */
  worlds: SceneWorld[]
}

/** What the Home screen's Resume list shows of a scene. */
export interface SceneSummary {
  id: string
  name: string
  /** a picture of the scene: the approved master, else the set's clay view, else the first drawn board tile; null = none yet */
  thumbnail: string | null
  stage: SceneStageReached
  /** the newest of the document, its draft and its takes */
  lastEdited: string
  hidden: boolean
  revision: number
}

/** Facts the stage screens and the next wave's warnings read (M3 confirm, M4 stale set). */
export interface SceneFacts {
  /** the scene already has a built set: building again makes a new world (the old one and its takes stay in `worlds`) */
  setBuilt: boolean
  /** the brief, lighting, materials or action changed since the current set was built from them */
  briefChanged: boolean
  /** takes locked on each of the scene's worlds */
  takes: Record<string, number>
}

export interface SceneView extends SceneDoc { summary: SceneSummary; facts: SceneFacts }

export interface SceneCreateRequest { name?: string }
export interface SceneRenameRequest { name: string; revision: number }
export interface SceneRemoveRequest { revision: number }
export interface SceneWorldRequest { worldId: string; revision: number }

// ---------------------------------------------------------------- paid jobs in flight, per scene

/** every paid action the app sends; the server maps each route to its intent (the client cannot mislabel one) */
export const JOB_INTENTS = ['develop', 'flesh', 'plan', 'concept', 'cast', 'master', 'hero', 'heroFinish', 'l2r', 'frameEdit'] as const
export type JobIntent = (typeof JOB_INTENTS)[number]

/** the paid POST routes, by intent (exact paths; their GETs and free sub-routes are not jobs) */
export const JOB_ROUTES: Record<JobIntent, string> = {
  develop: '/__lab/planner/develop', flesh: '/__lab/planner/flesh', plan: '/__lab/planner/plan',
  concept: '/__lab/scene/concepts', cast: '/__lab/cast/candidates', master: '/__lab/bible/master',
  hero: '/__lab/hero', heroFinish: '/__lab/hero/finish', l2r: '/__lab/l2r', frameEdit: '/__lab/frame-edit',
}
export const intentOfRoute = (pathname: string): JobIntent | null => {
  const p = pathname.replace(/\/+$/, '')
  return (Object.entries(JOB_ROUTES) as [JobIntent, string][]).find(([, r]) => r === p)?.[0] ?? null
}

/** headers a paid POST carries to be recorded as a job of a scene */
export const JOB_HEADERS = { scene: 'x-canvas-scene', job: 'x-canvas-job', target: 'x-canvas-target', price: 'x-canvas-price' } as const
/** `j-<base36 time>-<6>`, made by the page before it sends */
export const JOB_ID_RE = /^j-[a-z0-9]{6,12}-[a-z0-9]{6}$/
/** what a job is for inside its intent ("tile:p3", a take id, a world id); free text, short */
export const JOB_TARGET_RE = /^[\w:.@-]{1,80}$/

/**
 * One paid job of a scene, on disk at lab-assets/scene/<sceneId>/jobs/<jobId>.json. Written `running` when the POST arrives (before
 * any spend), rewritten `done` with the route's own reply when the route answers, whether or not the page is still listening.
 * `lost`: the server process that ran it is gone (a restart mid-job); the route's own Recover (by Cloud job id) takes it from there.
 */
export interface SceneJobRecord {
  id: string
  scene: string
  intent: JobIntent
  target: string
  /** credits shown on the button when it was pressed */
  price: number | null
  route: string
  status: 'running' | 'done' | 'lost'
  startedAt: string
  finishedAt?: string
  /** the route's reply, exactly as it was sent: its HTTP status and its JSON body */
  reply?: { status: number; body: unknown }
  pid?: number
  /** true while the job is queued behind another paid job (any scene's) and has not started yet; dropped once it starts */
  waiting?: boolean
  /** when it last stopped waiting and took its turn (absent = it never waited): its life as a running job counts from here */
  ranAt?: string
  /** the Cloud job id of the latest billed job this press submitted: what Check looks up and what stays recoverable after a Release */
  cloudJobId?: string
  /** when the user released it (Not responding -> Release): the queue no longer waits for it; its Cloud job is untouched and recoverable */
  released?: string
}
