// The page side of /__lab/pieces (server/pieces/plugin.ts): the Set step's "Build in 3D" (paid, priced on the button), the free
// place-after-recover, and the kit-world re-read every placement needs. Types only from the server side.
import type { PieceRecord, PiecesResponse } from '../../../server/pieces/spec'
import { KIT_CHANGED } from '../../labs/projection/stage3d/kitApi'
export type { PieceRecord, PiecesResponse, PieceTileState } from '../../../server/pieces/spec'

export const PIECES_ROUTE = '/__lab/pieces'
type Fetch = (input: string, init?: RequestInit) => Promise<Response>

/** a refusal or failure from the server; `jobId` = a billed job (recover it by id, never press again) */
export class PieceRequestError extends Error {
  readonly status: number
  readonly jobId?: string
  constructor(message: string, status: number, jobId?: string) { super(message); this.status = status; this.jobId = jobId }
}

async function body<T>(res: Response): Promise<T> {
  const b = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as T & { error?: string; jobId?: string }
  if (!res.ok) throw new PieceRequestError(b.error ?? `HTTP ${res.status}`, res.status, typeof b.jobId === 'string' ? b.jobId : undefined)
  return b
}
const post = (v: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(v) })

export interface PiecesApi {
  get(world: string): Promise<PiecesResponse>
  /** PAID: one TRELLIS.2 job; resolves once the piece is in the set's plan */
  build(world: string, tag: string): Promise<PieceRecord>
  /** free: fetch a billed build by id (it never submits), then place the mesh it brought back */
  recover(world: string, tag: string, run: string, jobId: string): Promise<PieceRecord>
  /** free: place a mesh that landed but is not in the plan yet */
  complete(world: string, tag: string, run: string): Promise<PieceRecord>
}

export function piecesApi(f: Fetch = fetch): PiecesApi {
  const complete = async (world: string, tag: string, run: string) => body<PieceRecord>(await f(`${PIECES_ROUTE}/complete`, post({ world, tag, run })))
  return {
    get: async (world) => body<PiecesResponse>(await f(`${PIECES_ROUTE}?world=${encodeURIComponent(world)}`, { cache: 'no-store' })),
    build: async (world, tag) => body<PieceRecord>(await f(`${PIECES_ROUTE}/build`, post({ world, tag }))),
    recover: async (world, tag, run, jobId) => { await body(await f('/__lab/jobs/recover', post({ jobId }))); return complete(world, tag, run) },
    complete,
  }
}

/** the set's plan changed on the server: Shoot and the Set step re-read the world (useKit), so the piece shows up */
export const kitChanged = (id: string) => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(KIT_CHANGED, { detail: { id } })) }
