// The fetch layer for the scene Bible routes (bibleContract BIBLE_ROUTES; track A1 serves them from server/bible/). Only
// `drawMaster` spends (a paid Cloud job on the server); the rest are free writes that each make the Bible's next version.
import {
  BIBLE_ROUTES, type BibleApproveRequest, type BibleCheckRequest, type BibleCheckResponse, type BibleElementRemoveRequest, type BibleElementRequest, type BibleMasterRequest,
  type BibleResponse, type BibleSaveRequest,
} from '../../shared/bibleContract'
import { jobFetch } from '../../jobs/sceneJobs'

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

/** a refusal from the Bible server, its own message when it sent one */
export class BibleRequestError extends Error {
  readonly status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

async function body(res: Response): Promise<BibleResponse> {
  const b = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as BibleResponse & { error?: string }
  if (!res.ok) throw new BibleRequestError(b.error ?? `HTTP ${res.status}`, res.status)
  return { bible: b.bible ?? null, running: b.running ?? null, ...(b.unrecovered?.length ? { unrecovered: b.unrecovered } : {}),
    ...(b.setApproval !== undefined ? { setApproval: b.setApproval, setKey: b.setKey ?? null } : {}) }
}
/** fired on window after any Bible write lands (detail: the world id), so views outside Scene (the strip) can read it again */
export const BIBLE_CHANGED = 'canvas-stage:bible-changed'
const changed = (r: BibleResponse): BibleResponse => {
  if (r.bible && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(BIBLE_CHANGED, { detail: r.bible.worldId }))
  return r
}
const post = (v: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(v) })
const R = BIBLE_ROUTES.bible

export interface BibleApi {
  get: (worldId: string) => Promise<BibleResponse>
  /** `keepalive`: the write outlives a page being closed (the words' last pause, flushed on leaving) */
  save: (req: BibleSaveRequest, o?: { keepalive?: boolean }) => Promise<BibleResponse>
  /** paid: draws master candidates (Qwen-Image 2512, depth-locked) and appends them */
  drawMaster: (req: BibleMasterRequest) => Promise<BibleResponse>
  approve: (req: BibleApproveRequest) => Promise<BibleResponse>
  /** free: approves the set as it stands (its set key), which the paid draws and the hero press need (setApproval.ts); `setKey`
   *  (review F1): a locked take's own set on show, approved by its key (the server accepts only the scene's or a locked take's) */
  approveSet: (worldId: string, setKey?: string) => Promise<BibleResponse>
  /** free, no world: what the Bible would refuse in this design (Build the set asks before the paid plan) */
  check: (req: BibleCheckRequest) => Promise<BibleCheckResponse>
  putElement: (req: BibleElementRequest) => Promise<BibleResponse>
  removeElement: (req: BibleElementRemoveRequest) => Promise<BibleResponse>
  /** free: fetches a billed master job by id (POST /__lab/jobs/recover); it never submits. The next get() shows its candidates. */
  recover: (jobId: string) => Promise<void>
}

/** a master draw's reply kept by the scene's job store (M1), read exactly as the draw's own response */
export const bibleReply = async (r: { status: number; body: unknown }): Promise<BibleResponse> =>
  changed(await body(new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: { 'content-type': 'application/json' } })))

/** `f`: jobFetch by default, so a master draw sent as a scene job carries the job's headers */
export function bibleApi(f: Fetch = jobFetch): BibleApi {
  return {
    get: async (worldId) => body(await f(`${R}?world=${encodeURIComponent(worldId)}`, { cache: 'no-store' })),
    save: async (req, o) => changed(await body(await f(R, { ...post(req), ...(o?.keepalive ? { keepalive: true } : {}) }))),
    drawMaster: async (req) => changed(await body(await f(`${R}/master`, post(req)))),
    approve: async (req) => changed(await body(await f(`${R}/approve`, post(req)))),
    approveSet: async (worldId, setKey) => changed(await body(await f(`${R}/set/approve`, post(setKey ? { worldId, setKey } : { worldId })))),
    check: async (req) => {
      const res = await f(`${R}/check`, post(req))
      const b = (await res.json().catch(() => ({}))) as Partial<BibleCheckResponse> & { error?: string }
      if (!res.ok) throw new BibleRequestError(b.error ?? `HTTP ${res.status}`, res.status)
      return { ok: !!b.ok, errors: b.errors ?? [] }
    },
    putElement: async (req) => changed(await body(await f(`${R}/element`, post(req)))),
    removeElement: async (req) => changed(await body(await f(`${R}/element/remove`, post(req)))),
    recover: async (jobId) => {
      const res = await f('/__lab/jobs/recover', post({ jobId }))
      if (!res.ok) { const b = (await res.json().catch(() => ({}))) as { error?: string }; throw new BibleRequestError(b.error ?? `HTTP ${res.status}`, res.status) }
    },
  }
}
