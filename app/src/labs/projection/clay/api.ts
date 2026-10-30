// The page side of the T1 routes (docs/wave-b-contract.md): list and lock takes, upload clay passes, finish, read the clay.
import {
  ROUTES, type ClayCamera, type ClayExport, type ClayFinishRequest, type ClayFrameKind, type ClayResponse, type ClayTiming, type TakeLockRequest,
  type TakeLockResponse, type TakeRecord, type TakesListResponse,
} from '../../../shared/shotContract'
import type { TakeLockPerf } from '../../../shared/takePerfContract'
import type { TakeLockSet } from '../../../shared/takeSetContract'
import type { TakeLockWords } from '../../../shared/takeWordsContract'

export type Fetch = typeof fetch

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({})) as T & { error?: string }
  if (!res.ok) throw Object.assign(new Error(body.error ?? `HTTP ${res.status}`), { status: res.status })
  return body
}

const JSON_HEADERS = { 'content-type': 'application/json' }

export async function listTakes(f: Fetch = fetch): Promise<TakeRecord[]> {
  return (await json<TakesListResponse>(await f(ROUTES.takes, { cache: 'no-store' }))).takes
}

/** `wordsFrom` (TakeLockWords): the take a new take's words are copied from; `perf` (TakeLockPerf): the walk the stage plays;
 *  `set` (TakeLockSet): the set on the stage */
export async function lockTake(q: TakeLockRequest & TakeLockWords & TakeLockPerf & TakeLockSet, f: Fetch = fetch): Promise<TakeLockResponse> {
  return json<TakeLockResponse>(await f(`${ROUTES.takes}/lock`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(q) }))
}

export async function uploadPass(takeId: string, frame: number, kind: ClayFrameKind, body: Uint8Array | Float32Array, f: Fetch = fetch): Promise<void> {
  const bytes = body instanceof Float32Array ? new Uint8Array(body.buffer, body.byteOffset, body.byteLength) : body
  const q = new URLSearchParams({ take: takeId, frame: String(frame), kind })
  await json(await f(`${ROUTES.clay}/depth?${q}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: bytes as BodyInit }))
}

/** a kit clay's extras on the finish (tidy wave): the page's phase timing, and whether every massing frame is up (the server
 *  then encodes massing.mp4 beside clay.mp4) */
export interface KitFinishExtra { timing?: ClayTiming; massing?: boolean
  /** the performer the frames were captured with (layerGuard.ts; null = none): the server refuses a finish that is not the take's */
  packId?: string | null
  /** the set key the frames were captured on (layerGuard.ts holdSet; null = no kit set): the server refuses one that is not the take's */
  setKey?: string | null }

export async function finishClay(takeId: string, cameras: ClayCamera[], key?: [number, number, number], f: Fetch = fetch, idColors?: Record<string, [number, number, number]>, extra: KitFinishExtra = {}): Promise<ClayExport> {
  /** E2: the ID pass's colour table rides on the finish body (ClayFinishRequest is Wave 0.5's; the server reads it as an extra field) */
  const q: ClayFinishRequest & KitFinishExtra & { idColors?: Record<string, [number, number, number]> } = {
    takeId, cameras, ...(key ? { key } : {}), ...(idColors ? { idColors } : {}), ...(extra.timing ? { timing: extra.timing } : {}), ...(extra.massing ? { massing: true } : {}),
    ...(extra.packId !== undefined ? { packId: extra.packId } : {}),
    ...(extra.setKey !== undefined ? { setKey: extra.setKey } : {}),
  }
  return (await json<ClayResponse>(await f(`${ROUTES.clay}/finish`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(q) }))).clay
}

/** the take's clay, or null before its first export */
export async function getClay(takeId: string, f: Fetch = fetch): Promise<ClayExport | null> {
  const res = await f(`${ROUTES.clay}?take=${encodeURIComponent(takeId)}`, { cache: 'no-store' })
  if (res.status === 404) return null
  return (await json<ClayResponse>(res)).clay ?? null
}
