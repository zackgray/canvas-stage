// The Scene design calls. Every call the design flow makes that is not a Bible route goes through here, so tests mock one object.
//   the planner (S2, server/planner/, PLANNER_ROUTES in bibleContract.ts): plan and develop, paid (one Gemma job each); its status, free
//   candidates: people and creatures are the Cast card front draw (POST /__lab/cast/candidates); every other kind is a concept
//     draw (POST /__lab/scene/concepts, Qwen-Image 2512 text-to-image, full or draft), sceneContract.ts
//   the draft design before a world exists, uploads as real files, and the draft's move into the Bible at Build the set (free)
//   a Cast card saved from an approved person or creature tile (free: its face kept under the card, then a project version)
// 400/409/429/503 = refused before any spend; 422 = billed, still invalid after the retry; 502 + jobId = recover by id, never resend.
// `project` is the library scene id: each scene has its own draft. Draft writes carry the revision they were read at, one at a time;
// a stale one (another tab wrote the scene) throws StaleSceneError and nothing is overwritten (m7). The paid calls go out through
// jobFetch, so inside a job (src/jobs) they carry its headers; `parse` turns a job's stored reply into what the call returns (M1).
import { generateFronts } from '../../labs/projection/cast/api'
import { jobFetch } from '../../jobs/sceneJobs'
import type { BibleApi } from './bibleApi'
import { flatTouched } from './design/briefV2'
import { StaleSceneError } from '../../library/api'
import type { JobIntent, SceneJobRecord } from '../../shared/libraryContract'
import { postVersion } from '../../project/api'
import { DEFAULT_PROJECT } from '../../project/model'
import {
  PLANNER_ROUTES, type BibleSaveRequest, type DevelopRequest, type DevelopResponse, type PlannerStatus, type PlanRequest, type PlanResponse,
} from '../../shared/bibleContract'
import {
  SCENE_ROUTES, UPLOAD_LIMIT, UPLOAD_TYPES, type ConceptQuality, type ConceptResponse, type DraftDesign, type DraftMigrateResponse,
  type DraftResponse, type PropParts, type UploadResponse,
} from '../../shared/sceneContract'
import type { SceneBriefV2 } from '../../shared/briefContract'

/** this screen's piece kinds: the brief's cast types plus the look types the board draws */
export type PieceType = 'person' | 'creature' | 'group' | 'prop' | 'location' | 'mood' | 'beat' | 'lighting' | 'material'
export type GuidedStageId = 'loc' | 'cast' | 'mood' | 'mats' | 'story'
export interface CandidatesRequest {
  type: PieceType; prompt: string; count: number; name?: string
  /** concept kinds only: 'draft' = the Lightning 4-step draw (about a fifth of the price) */
  quality?: ConceptQuality
  /** the scene's lines, so every concept sits in the same light */
  lighting?: string; materials?: string
  /** people only, each only when the person maker's box was edited: the short "no logos or printed text" line (absent: it is sent
   *  as the default; '' = the user removed it under Advanced) and "How the picture is taken" (absent: the server's own head and tail) */
  rules?: string; framing?: string
  /** props only: the ADVANCED parts the user edited (view, setup, light, rules; absent = the defaults) */
  parts?: PropParts
}
export interface CandidatesResponse { urls: string[] }
/** a Cast card from a Scene tile: `face` is the approved look (a drawn front or an upload) */
export interface SaveCardRequest { cardId: string; name: string; description: string; face: string }

export interface BriefApi {
  plan: (r: PlanRequest) => Promise<PlanResponse>
  /** paid: the user's own text as a developed scene brief (one Gemma job, at most one retry), the front door's Develop it */
  develop: (r: DevelopRequest) => Promise<DevelopResponse>
  /** free: the planner's prices and today's budget as the server holds them, read before a press is offered */
  status: () => Promise<PlannerStatus>
  /** paid: candidate images for one piece */
  candidates: (r: CandidatesRequest) => Promise<CandidatesResponse>
  /** a dropped or uploaded image as a real reference file (free) */
  uploadReference: (f: File) => Promise<string>
  /** the draft design saved for the project (null = none) */
  loadDraft: () => Promise<DraftDesign | null>
  saveDraft: (design: DraftDesign, o?: { keepalive?: boolean }) => Promise<void>
  /** at Build the set: the draft's files into the world's Bible; old URL -> new */
  migrateDraft: (worldId: string) => Promise<Record<string, string>>
  /** free: a billed concept draw whose images never landed, fetched by id (never a new draw), then its run read back */
  recoverConcept: (jobId: string, runId: string) => Promise<CandidatesResponse>
  /** free: the face kept as the card's own file, then the card's next version in the project (Blocking's Played by, the face) */
  saveCard: (r: SaveCardRequest) => Promise<void>
  /** a paid job's stored reply (plan / concept / cast) as the call would have returned it, or its error */
  parse?: (job: Pick<SceneJobRecord, 'intent'>, reply: { status: number; body: unknown }) => Promise<unknown>
}

/** a refusal or failure from a paid route; `billed` when the server says the job ran (422, or 502 with a job id to recover) */
export class PlannerError extends Error {
  readonly status: number; readonly billed: boolean; readonly jobId?: string
  /** a billed concept draw's run: Recover completes it from there */
  readonly runId?: string
  /** (a 422: the answer failed the check twice) what the press's jobs billed, measured or at their estimate (PlannerRunBase) */
  readonly spentCredits?: number
  constructor(message: string, status: number, billed: boolean, jobId?: string, runId?: string, spentCredits?: number) {
    super(message); this.status = status; this.billed = billed; this.jobId = jobId; this.runId = runId; this.spentCredits = spentCredits
  }
}
/** what a failed planner press billed anyway (a 422 bills both its jobs), to add to the shown spend; 0 for anything not billed */
export const failedSpend = (e: unknown): number => (e instanceof PlannerError && e.status === 422 && typeof e.spentCredits === 'number' ? e.spentCredits : 0)

type Fetch = (input: string, init?: RequestInit) => Promise<Response>
async function reply<T>(res: Response): Promise<T> {
  const b = (await res.json().catch(() => ({}))) as T & { error?: string; jobId?: string; runId?: string; spentCredits?: number }
  if (!res.ok) {
    const billed = res.status === 422 || (res.status === 502 && !!b.jobId)
    const why = b.error ?? `HTTP ${res.status}`
    throw new PlannerError(res.status === 502 && b.jobId ? `${why} (job ${b.jobId}: billed; recover it by id, do not press again)` : why, res.status, billed, b.jobId, b.runId, b.spentCredits)
  }
  return b
}
const post = <T>(f: Fetch, path: string, body: unknown) =>
  f(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => reply<T>(r))
const cardBase = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '') || 'character'
let press = 0
/**
 * A card id of its own for every front draw (wave 3 M3): the Cast route redraws a card's cand-1..N in place, so two presses on one
 * name ("Generate more", "Redraw") would put the second pair where the first, paid, pair was. `<name>-<time><n>`, 41 at most.
 */
export const drawCardId = (name: string, now = Date.now()) => `${cardBase(name)}-${now.toString(36)}${(++press % 36).toString(36)}`
const P = PLANNER_ROUTES.planner, S = SCENE_ROUTES.scene
const IMAGE_TYPES: string[] = Object.values(UPLOAD_TYPES)

/**
 * The one rules line every default look prompt carries (owner 2026-10-28, blank-look-thumbnail): the long legal "Rules every look
 * follows" text is the user's side, not the app's, and is gone from the panel and the prompt; only this short line stays, and the
 * user can remove it under Advanced (then '' is sent and the prompt carries no rules line at all).
 */
export const DEFAULT_LOOK_RULES = 'No logos or printed text.'

const asResponse = (r: { status: number; body: unknown }) => new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: { 'content-type': 'application/json' } })
const urlsOf = (intent: JobIntent, b: unknown): CandidatesResponse => ({ urls: (intent === 'cast' ? (b as { candidates?: string[] }).candidates : (b as ConceptResponse).urls) ?? [] })

export function briefApi(f: Fetch = jobFetch, project = DEFAULT_PROJECT): BriefApi {
  /** the draft's revision as this page last read or wrote it; writes queue so each one is based on the last */
  let revision = 0
  let writes: Promise<unknown> = Promise.resolve()
  const draftWrite = <T>(path: string, body: Record<string, unknown>, after: (b: T) => void, keepalive = false): Promise<void> => {
    const run = writes.catch(() => {}).then(async () => {
      const res = await f(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project, ...body, revision }), ...(keepalive ? { keepalive: true } : {}) })
      if (res.status === 409) { const b = (await res.json().catch(() => ({}))) as { error?: string; revision?: number }; throw new StaleSceneError(b.error, b.revision) }
      after(await reply<T>(res))
    })
    writes = run
    return run
  }
  return {
    plan: (r) => post(f, `${P}/plan`, r),
    develop: (r) => post(f, `${P}/develop`, r),
    status: async () => reply<PlannerStatus>(await f(P, { cache: 'no-store' })),
    candidates: async (r) => {
      if (r.type === 'person' || r.type === 'creature') {
        // the Cast card front draw: 1..4 a job (the server's floor is 1, as is the Cast stepper's)
        const out = await generateFronts({
          cardId: drawCardId(r.name ?? r.type), name: r.name, description: r.prompt, rules: r.rules ?? DEFAULT_LOOK_RULES,
          ...(r.framing !== undefined ? { framing: r.framing } : {}), count: Math.min(4, Math.max(1, r.count)),
        }, f)
        return { urls: out.candidates }
      }
      const out = await post<ConceptResponse>(f, `${S}/concepts`, {
        kind: r.type, description: r.prompt, ...(r.name ? { name: r.name } : {}), count: r.count, quality: r.quality ?? 'full', project,
        ...(r.lighting?.trim() ? { lighting: r.lighting.trim() } : {}), ...(r.materials?.trim() ? { materials: r.materials.trim() } : {}),
        ...(r.type === 'prop' && r.parts && Object.keys(r.parts).length ? { parts: r.parts } : {}),
      })
      return { urls: out.urls }
    },
    uploadReference: async (file) => {
      // the same limits the server holds, said before anything is sent
      if (!IMAGE_TYPES.includes(file.type)) throw new Error('Only PNG, JPEG or WebP images can be uploaded')
      if (file.size > UPLOAD_LIMIT) throw new Error(`The image is larger than ${UPLOAD_LIMIT / 1024 / 1024} MB`)
      const res = await f(`${S}/upload?project=${encodeURIComponent(project)}`, { method: 'POST', headers: { 'content-type': file.type }, body: file })
      return (await reply<UploadResponse>(res)).url
    },
    loadDraft: async () => {
      const d = (await reply<DraftResponse>(await f(`${S}/draft?project=${encodeURIComponent(project)}`, { cache: 'no-store' }))).draft
      revision = d?.revision ?? 0
      return d?.design ?? null
    },
    saveDraft: (design, o) => draftWrite<DraftResponse>(`${S}/draft`, { design }, (b) => { revision = b.draft?.revision ?? revision + 1 }, !!o?.keepalive),
    migrateDraft: async (worldId) => (await post<DraftMigrateResponse>(f, `${S}/draft/migrate`, { project, worldId })).moved,
    recoverConcept: async (jobId, runId) => {
      await post(f, '/__lab/jobs/recover', { jobId })
      const out = await reply<ConceptResponse>(await f(`${S}/concepts/run?id=${encodeURIComponent(runId)}&project=${encodeURIComponent(project)}`, { cache: 'no-store' }))
      return { urls: out.urls }
    },
    saveCard: async (r) => {
      const { url } = await post<{ url: string }>(f, '/__lab/cast/keep', { cardId: r.cardId, from: r.face })
      const description = r.description.trim() || r.name.trim()
      await postVersion(DEFAULT_PROJECT, 'cast', r.cardId, { name: r.name.trim(), description, references: [url, url], sheets: [] }, r.name.trim(), f)
    },
    parse: async (job, r) => {
      const b = await reply<unknown>(asResponse(r))
      return job.intent === 'concept' || job.intent === 'cast' ? urlsOf(job.intent, b) : b
    },
  }
}

/**
 * The v2 brief onto the world's Bible (the save route takes `brief`; null removes it). The Bible derives its lighting, materials and
 * background lines from a saved brief unless the same save writes them, so a save of fields that feed none of them (camera, beats…)
 * pins the lines as they are now, and only an edit of light, an element or the background lets the brief rewrite them. Used by the
 * sheet-staleness tests; the page's own sync of a replaced brief goes through the same route (useV2Save).
 */
export async function saveBriefToBible(api: BibleApi, worldId: string, brief: SceneBriefV2 | null): Promise<void> {
  const req: BibleSaveRequest = { worldId, brief }
  if (brief && !flatTouched(brief)) {
    const cur = (await api.get(worldId)).bible
    if (cur) Object.assign(req, { lighting: cur.lighting, materials: cur.materials, ...(cur.background !== undefined ? { background: cur.background } : {}) })
  }
  await api.save(req)
}
