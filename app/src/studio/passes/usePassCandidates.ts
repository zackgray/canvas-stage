import { useCallback, useEffect, useRef, useState } from 'react'
import type { PassCandidate, PassListResponse } from '../../shared/passContract'
import { PASS_DISCARD, PASS_KEEP, PASS_RECOVER, PASS_ROUTE } from './routes'

export const POLL_MS = 3000

export interface PassCandidates {
  candidates: PassCandidate[]
  /** a decision or a list call failed (plain words); null when fine */
  error: string | null
  /** the candidate ids with a call out */
  busy: ReadonlySet<string>
  keep: (id: string) => Promise<void>
  discard: (id: string) => Promise<void>
  /** free: fetch a running or failed candidate's job by id; never resubmits */
  recover: (id: string) => Promise<void>
  refresh: () => Promise<void>
}

const post = (url: string, id: string) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) })

/** A take's pass candidates: listed on mount, re-listed every few seconds while any is running, Keep / Discard / Recover write the answer back. */
export function usePassCandidates(takeId: string | null | undefined): PassCandidates {
  const [candidates, setCandidates] = useState<PassCandidate[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])

  const refresh = useCallback(async () => {
    if (!takeId) { setCandidates([]); return }
    try {
      const r = await fetch(`${PASS_ROUTE}?take=${encodeURIComponent(takeId)}`)
      const body = await r.json().catch(() => null) as (PassListResponse & { error?: string }) | null
      if (!live.current) return
      // a reply without the list (an older server, a proxy page) is said, never trusted: the list stays what it was
      if (!r.ok || !Array.isArray(body?.candidates)) setError(body?.error ?? 'Could not read the pass candidates.')
      else { setCandidates(body.candidates); setError(null) }
    } catch { if (live.current) setError('Could not reach the server to read the pass candidates.') }
  }, [takeId])

  useEffect(() => { void refresh() }, [refresh])
  const anyRunning = candidates.some((c) => c.state === 'running')
  useEffect(() => {
    if (!anyRunning) return
    const id = setInterval(() => { void refresh() }, POLL_MS)
    return () => clearInterval(id)
  }, [anyRunning, refresh])

  const decide = useCallback(async (url: string, id: string) => {
    setBusy((b) => new Set(b).add(id))
    let refused: string | null = null
    try {
      const r = await post(url, id)
      const body = await r.json() as { candidate?: PassCandidate; error?: string }
      if (!live.current) return
      if (!r.ok || !body.candidate) { refused = body.error ?? 'That did not go through.'; setError(refused) }
      else { const next = body.candidate; setCandidates((l) => l.map((c) => (c.id === next.id ? next : c))); setError(null) }
    } catch { refused = 'Could not reach the server.'; if (live.current) setError(refused) } finally {
      if (live.current) setBusy((b) => { const n = new Set(b); n.delete(id); return n })
    }
    if (live.current) await refresh() // a refused Keep (the image changed) shows the truth, not the stale card
    if (live.current && refused) setError(refused) // ...and the list call must not wipe the reason
  }, [refresh])

  return { candidates, error, busy, refresh, keep: (id) => decide(PASS_KEEP, id), discard: (id) => decide(PASS_DISCARD, id), recover: (id) => decide(PASS_RECOVER, id) }
}
