import { useCallback, useEffect, useRef, useState } from 'react'
import { FACE_ROUTE, FACE_TRACK_ROUTE, type FacePassStatus, type FacePersonView } from './FacePassTypes'

export interface FacePassHook {
  /** null until the server answers (an older server, or no render on show: the row stays hidden) */
  status: FacePassStatus | null
  error: string | null
  /** the subjects with a call out */
  busy: ReadonlySet<string>
  /** free: the head track and the face strip */
  track: (subject: string) => Promise<void>
  /** paid: answers once the candidate exists; then the candidate list carries it */
  fix: (subject: string) => Promise<boolean>
  refresh: () => Promise<void>
}

const post = (url: string, body: object) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

/** The face pass's people on one finished render: listed when the render on show changes, then on demand. */
export function useFacePass(renderId: string | null | undefined): FacePassHook {
  const [status, setStatus] = useState<FacePassStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])

  const refresh = useCallback(async () => {
    if (!renderId) { setStatus(null); return }
    try {
      const r = await fetch(`${FACE_ROUTE}?render=${encodeURIComponent(renderId)}`)
      if (!live.current) return
      const b = r.ok ? await r.json().catch(() => null) as FacePassStatus | null : null
      // a reply without the people list is no status (the strip would crash reading it)
      if (b && Array.isArray(b.people)) { setStatus(b); setError(null) } else setStatus(null)
    } catch { if (live.current) setStatus(null) }
  }, [renderId])
  useEffect(() => { setStatus(null); void refresh() }, [refresh])

  const call = useCallback(async (subject: string, url: string): Promise<{ ok: boolean; body: { person?: FacePersonView; error?: string } }> => {
    setBusy((b) => new Set(b).add(subject))
    try {
      const r = await post(url, { renderId, subject })
      const body = await r.json() as { person?: FacePersonView; error?: string }
      if (live.current) setError(r.ok ? null : body.error ?? 'That did not go through.')
      return { ok: r.ok, body }
    } catch {
      if (live.current) setError('Could not reach the server.')
      return { ok: false, body: {} }
    } finally {
      if (live.current) setBusy((b) => { const n = new Set(b); n.delete(subject); return n })
    }
  }, [renderId])

  const track = useCallback(async (subject: string) => {
    const { ok, body } = await call(subject, FACE_TRACK_ROUTE)
    const person = body.person
    if (ok && person && live.current) setStatus((s) => (s ? { ...s, people: s.people.map((p) => (p.subject === subject ? person : p)) } : s))
  }, [call])
  const fix = useCallback(async (subject: string) => {
    const { ok } = await call(subject, FACE_ROUTE)
    if (live.current) await refresh()
    return ok
  }, [call, refresh])

  return { status, error, busy, track, fix, refresh }
}
