// Browser side of the hero-still endpoints (server/hero/plugin.ts) and T1's takes list. Errors keep the server's plain message,
// its code and the Cloud job id (so a failed press can offer "Recover").
import { jobFetch } from '../../jobs/sceneJobs'
import { coalesced } from './takesRequest'
import { SET_NOT_APPROVED } from '../../shared/setApproval'
import { ROUTES, type HeroListResponse, type HeroRenderRequest, type HeroResponse, type TakeRecord, type TakesListResponse } from '../../shared/shotContract'

export class HeroApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly jobId: string | null
  constructor(status: number, message: string, code: string | null = null, jobId: string | null = null) { super(message); this.status = status; this.code = code; this.jobId = jobId }
}

async function read<T>(res: Response): Promise<T> {
  const text = await res.text()
  let body: unknown = null
  try { body = text ? JSON.parse(text) : null } catch { /* not JSON */ }
  if (!res.ok) {
    const b = (body ?? {}) as { error?: string; code?: string; jobId?: string }
    throw new HeroApiError(res.status, b.error ?? (res.status === 409 ? SET_NOT_APPROVED : text.slice(0, 200) || `request failed (${res.status})`), b.code ?? null, b.jobId ?? null)
  }
  return body as T
}
// jobFetch: a paid press sent as a scene job (src/jobs) carries the job's headers; anything else goes out as before
const post = (url: string, body: unknown) => jobFetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
/** a hero job's reply kept by the scene's job store, read exactly as the press's own response (its error, its code, its job id) */
export const heroReply = (r: { status: number; body: unknown }) =>
  read<HeroResponse>(new Response(JSON.stringify(r.body ?? null), { status: r.status, headers: { 'content-type': 'application/json' } }))

/** The locked takes (T1), or [] while that endpoint is not built / reachable. */
async function loadTakes(): Promise<TakeRecord[]> {
  try {
    const res = await fetch(ROUTES.takes, { cache: 'no-store' })
    return res.ok ? ((await res.json()) as TakesListResponse).takes ?? [] : []
  } catch { return [] }
}
/** one request for every caller at once (takesRequest.ts): each still gets a list read after its call began */
export const fetchTakes = coalesced(loadTakes)
export const fetchHero = async (takeId: string): Promise<HeroListResponse> => read(await fetch(`${ROUTES.hero}?take=${encodeURIComponent(takeId)}`, { cache: 'no-store' }))
export const uploadOpening = async (takeId: string, startKey: string, png: Blob): Promise<void> => {
  await read(await fetch(`${ROUTES.hero}/opening?take=${encodeURIComponent(takeId)}&key=${encodeURIComponent(startKey)}`, { method: 'POST', headers: { 'content-type': 'image/png' }, body: png }))
}
export const renderHero = async (req: HeroRenderRequest): Promise<HeroResponse> => read(await post(ROUTES.hero, req))
/** kit stills: the Klein finish alone for draws whose finish never ran (server/hero/kitFinish.ts); paid, ~2 cr a still */
export const finishHero = async (takeId: string, ids?: string[]): Promise<HeroResponse> => read(await post(`${ROUTES.hero}/finish`, { takeId, ...(ids?.length ? { ids } : {}) }))
export const approveHero = async (takeId: string, stillId: string): Promise<HeroResponse> => read(await post(`${ROUTES.hero}/approve`, { takeId, stillId }))
/** takes the approval off a still (Render needs an approved opening again); the still itself stays */
export const unapproveHero = async (takeId: string, stillId: string): Promise<HeroResponse> => read(await post(`${ROUTES.hero}/unapprove`, { takeId, stillId }))
/** takes a locked take off every list; the server moves its folder aside, nothing paid is deleted */
export const discardTake = async (takeId: string): Promise<void> => { await read(await post(`${ROUTES.takes}/discard`, { takeId })) }
export const recoverJob = async (jobId: string): Promise<void> => { await read(await post('/__lab/jobs/recover', { jobId })) }

/** a take's hero stills changed here (a version used or a new one edited): every reader of the list reads it again at once, so the
 *  right panel's Approve, the step cue and the version strip never disagree about which frame is in use */
export const HERO_CHANGED = 'canvas-stage:hero-changed'
export const heroChanged = (takeId: string): void => { window.dispatchEvent(new CustomEvent(HERO_CHANGED, { detail: takeId })) }
export const onHeroChanged = (takeId: string, f: () => void): (() => void) => {
  const on = (e: Event) => { if ((e as CustomEvent<string>).detail === takeId) f() }
  window.addEventListener(HERO_CHANGED, on)
  return () => window.removeEventListener(HERO_CHANGED, on)
}
