import { useEffect, useState } from 'react'
import { STILL_PREVIEW_ROUTE, type DrawMode, type LockPresetId, type StillPreviewRequest, type StillPreviewResponse } from '../../shared/stillPressContract'
import type { KeyframeRole } from '../../shared/shotContract'

/** what the owner chose on the preview card; `refs` null = the server's default refs, `edited` null = the composed prompt */
export interface PressChoice { preset: LockPresetId; refs: string[] | null; edited: string | null }
export const FIRST_CHOICE: PressChoice = { preset: 'photographic', refs: null, edited: null }

const DEBOUNCE_MS = 400

/** POST /__lab/hero/preview (free): the server's composition of the press, or the plain reason it would be refused */
export async function fetchStillPreview(req: StillPreviewRequest): Promise<StillPreviewResponse> {
  const res = await fetch(STILL_PREVIEW_ROUTE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) })
  const body = await res.json().catch(() => null) as (StillPreviewResponse & { error?: string }) | null
  if (!res.ok || !body) throw new Error(body?.error ?? `the preview could not be composed (${res.status})`)
  // a reply that is not a preview (an older server, a proxy page) is a failed preview, never a half-drawn card
  if (typeof body.prompt !== 'string' || !Array.isArray(body.refs)) throw new Error('the preview could not be composed (unexpected reply)')
  return body
}

/**
 * The press preview for a kit still, read again (debounced) whenever what the press would send changes: the take or its start,
 * the keyframe and frame, the lock, the refs, the seeds, the edited prompt, or the 3D set frames (`clayKey`). Off (`take` null)
 * for a panorama still. A preview of older inputs is never shown.
 */
export function useStillPreview(o: { takeId: string | null; startKey?: string; role: KeyframeRole; frame?: number; count: number; choice: PressChoice; mode?: DrawMode; clayKey?: string | null; sameLook?: boolean; finishPrompt?: string; drawAdds?: StillPreviewRequest['drawAdds'] }) {
  const { takeId, role, frame, count, choice } = o
  const req: StillPreviewRequest | null = takeId ? {
    takeId, role, ...(o.mode === 'edit' ? { mode: o.mode } : {}), ...(frame !== undefined ? { frame } : {}), preset: choice.preset, count,
    ...(choice.refs ? { materials: choice.refs } : {}), ...(choice.edited !== null ? { prompt: choice.edited } : {}), ...(o.sameLook ? { sameLook: true } : {}),
    ...(o.finishPrompt ? { finishPrompt: o.finishPrompt } : {}), ...(o.drawAdds ? { drawAdds: o.drawAdds } : {}),
  } : null
  const key = req ? JSON.stringify([req, o.startKey, o.clayKey ?? null]) : null
  const base = JSON.stringify([takeId, o.startKey, role, frame ?? null, o.clayKey ?? null])
  const [got, setGot] = useState<{ key: string; base: string; p: StillPreviewResponse | null; error: string | null } | null>(null)
  useEffect(() => {
    if (!key || !req) return
    let live = true
    const t = setTimeout(() => {
      fetchStillPreview(req).then((p) => { if (live) setGot({ key, base, p, error: null }) }, (e: unknown) => { if (live) setGot({ key, base, p: null, error: e instanceof Error ? e.message : String(e) }) })
    }, choice.edited !== null || o.finishPrompt ? DEBOUNCE_MS : 0)
    return () => { live = false; clearTimeout(t) }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- `key` is the request
  const fresh = got && got.key === key ? got : null
  // while a new reading is on its way, the last one of the SAME take, start, keyframe and frames stays up (no flicker as you type)
  const kept = fresh ?? (got?.p && got.base === base ? got : null)
  return { preview: kept?.p ?? null, error: fresh?.error ?? null, loading: !!key && !fresh }
}
