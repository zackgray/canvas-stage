import { useCallback, useEffect, useRef, useState } from 'react'
import type { RedrawRequest, StillJudge } from '../../../server/hero/redrawSpec'
import { ROUTES } from '../../shared/shotContract'

export type Judge = StillJudge & { redrawnInto: string | null }

/** a reply is a judge only when it has the judge's shape (an older server, or a stub, answers something else) */
const isJudge = (b: unknown): b is Judge => !!b && typeof b === 'object' && Array.isArray((b as Judge).people) && Array.isArray((b as Judge).pieces)

/** GET /__lab/hero/judge for the shown still (free, local); read again with `refresh` after a Keep */
export function useStillJudge(takeId: string | null, stillId: string | null): { judge: Judge | null; error: string | null; refresh: () => Promise<Judge | null> } {
  const [got, setGot] = useState<{ key: string; judge: Judge | null; error: string | null } | null>(null)
  const key = takeId && stillId ? `${takeId}/${stillId}` : null
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const read = useCallback(async (): Promise<Judge | null> => {
    if (!takeId || !stillId || !key) return null
    try {
      const r = await fetch(`${ROUTES.hero}/judge?take=${encodeURIComponent(takeId)}&still=${encodeURIComponent(stillId)}`)
      const b = await r.json() as unknown
      const judge = r.ok && isJudge(b) ? b : null
      if (live.current) setGot({ key, judge, error: judge ? null : (b as { error?: string })?.error ?? 'Could not check the people in this still.' })
      return judge
    } catch {
      if (live.current) setGot({ key, judge: null, error: 'Could not reach the server to check the people in this still.' })
      return null
    }
  }, [takeId, stillId, key])
  useEffect(() => { void read() }, [read])
  const mine = got && got.key === key ? got : null
  return { judge: mine?.judge ?? null, error: mine?.error ?? null, refresh: read }
}

/** POST /__lab/hero/redraw (paid): the candidate is listed from the start, so the caller re-reads the pass list as soon as it is sent */
export async function postRedraw(req: RedrawRequest): Promise<string | null> {
  try {
    const r = await fetch(`${ROUTES.hero}/redraw`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) })
    if (r.ok) return null
    const b = await r.json().catch(() => ({})) as { error?: string }
    return b.error ?? 'The redraw did not go through.'
  } catch { return 'Could not reach the server. If the redraw was already sent, it is listed below once it runs; nothing is sent twice.' }
}
