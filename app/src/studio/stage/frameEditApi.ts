// Browser side of the "Edit this frame" endpoint (server/frameEdit/plugin.ts). The press goes through jobFetch so the scene's
// job store records it like every paid press; errors keep the server's plain message, its code and the Cloud job id (Recover).
import { jobFetch } from '../../jobs/sceneJobs'
import { HeroApiError } from '../shoot/heroApi'
import { FRAME_EDIT_ROUTE, type FrameEditRequest, type FrameEditResponse } from '../../../server/frameEdit/spec'

export async function postFrameEdit(req: FrameEditRequest): Promise<FrameEditResponse> {
  const res = await jobFetch(FRAME_EDIT_ROUTE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) })
  const text = await res.text()
  let body: unknown = null
  try { body = text ? JSON.parse(text) : null } catch { /* not JSON */ }
  if (!res.ok) {
    const b = (body ?? {}) as { error?: string; code?: string; jobId?: string }
    throw new HeroApiError(res.status, b.error ?? (text.slice(0, 200) || `request failed (${res.status})`), b.code ?? null, b.jobId ?? null)
  }
  return body as FrameEditResponse
}
