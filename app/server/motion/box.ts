/**
 * The motion box's HTTP client (docs/motion-box-contract.md): loopback JSON, `Authorization: Bearer <token>` on every
 * call. Each call takes its own timeout (plan 1.4): the health probe 2 s, polls 10 s, keep downloads 30 s. A network
 * failure or timeout throws BoxError with status 0, which the routes map to offline / lost contact.
 */
import type { BoxHealth, BoxJobStatus, BoxStage } from './types.ts'

export class BoxError extends Error {
  readonly status: number
  constructor(message: string, status = 0) {
    super(message)
    this.status = status
  }
}

export type BoxTarget = { baseUrl: string; token?: string }

async function call(target: BoxTarget, path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const headers: Record<string, string> = { authorization: `Bearer ${target.token ?? ''}`, ...init.headers as Record<string, string> | undefined }
  let res: Response
  try {
    res = await fetch(`${target.baseUrl}${path}`, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) })
  } catch {
    throw new BoxError('unreachable')
  }
  return res
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return await res.json() as Record<string, unknown>
  } catch {
    return {}
  }
}

/** 2 s probe (plan 1.4). Throws BoxError on any failure; the caller maps that to offline. */
export async function boxHealth(target: BoxTarget): Promise<BoxHealth> {
  const res = await call(target, '/health', { method: 'GET', headers: { accept: 'application/json' } }, 2000)
  if (!res.ok) throw new BoxError(`health -> HTTP ${res.status}`, res.status)
  return await res.json() as BoxHealth
}

/** forwards the move spec; returns the new job id. 409 busy and 422 bad spec pass through as BoxError. */
export async function boxMake(target: BoxTarget, payload: unknown): Promise<string> {
  const res = await call(target, '/jobs', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload) }, 10000)
  const body = await readJson(res)
  if (res.status === 409) throw new BoxError('busy', 409)
  if (!res.ok) throw new BoxError(typeof body.message === 'string' ? body.message : `box -> HTTP ${res.status}`, res.status)
  if (typeof body.id !== 'string') throw new BoxError('box returned no job id')
  return body.id
}

/** one poll of the job status. */
export async function boxJob(target: BoxTarget, id: string): Promise<BoxJobStatus> {
  const res = await call(target, `/jobs/${id}`, { method: 'GET', headers: { accept: 'application/json' } }, 10000)
  if (!res.ok) throw new BoxError(`job -> HTTP ${res.status}`, res.status)
  return await res.json() as BoxJobStatus
}

/** stops after the current try; returns the stage the job settled in. */
export async function boxCancel(target: BoxTarget, id: string): Promise<BoxStage> {
  const res = await call(target, `/jobs/${id}/cancel`, { method: 'POST', headers: { accept: 'application/json' } }, 10000)
  if (!res.ok) throw new BoxError(`cancel -> HTTP ${res.status}`, res.status)
  const body = await readJson(res)
  return (typeof body.stage === 'string' ? body.stage : 'cancelled') as BoxStage
}

/** a try's file: the retargeted BVH, the strip, or the scores JSON. 30 s (plan 1.4, keep/download). */
export async function boxFile(target: BoxTarget, id: string, tryId: number | string, ext: 'bvh' | 'png' | 'json'): Promise<Buffer> {
  const res = await call(target, `/jobs/${id}/files/${tryId}.${ext}`, { method: 'GET' }, 30000)
  if (!res.ok) throw new BoxError(`file ${tryId}.${ext} -> HTTP ${res.status}`, res.status)
  return Buffer.from(await res.arrayBuffer())
}
