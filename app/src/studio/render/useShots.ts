import { useEffect, useState } from 'react'
import { SHOTS_ROUTE, type ShotRow, type ShotsListResponse } from '../../shared/shotsListContract'
import type { L2RState } from './l2rStore'

/** while a row says rendering (it may be a take other than the one the store polls), the list is read again this often */
const POLL_MS = 5000

/** what changes the list: the world's takes, and the renders of the take on show (its poll lands a new state) */
const signature = (s: L2RState): string =>
  `${s.worldId ?? ''}|${s.takes.map((t) => t.id).join(',')}|${(s.status?.renders ?? []).map((r) => `${r.id}:${r.status}:${r.finished ? 1 : 0}`).join(',')}`

/**
 * The scene's shots (GET /__lab/l2r/shots?world=, free): every locked take of the world on the set with its newest render's state,
 * for Render's list and Export's other shots. Read again when the store's takes or the shown take's renders change; an older
 * server without the route answers no rows (the lists then show the store's takes with no render facts).
 */
export function useShots(s: L2RState): ShotRow[] {
  const world = s.worldId ?? null
  const sig = signature(s)
  const [got, setGot] = useState<{ world: string | null; rows: ShotRow[] }>({ world: null, rows: [] })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!world) return
    let live = true
    fetch(`${SHOTS_ROUTE}?world=${encodeURIComponent(world)}`, { cache: 'no-store' })
      .then(async (r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? ((await r.json()) as ShotsListResponse) : null))
      .then((b) => { if (live) setGot({ world, rows: b?.shots ?? [] }) })
      .catch(() => { if (live) setGot({ world, rows: [] }) })
    return () => { live = false }
  }, [world, sig, tick])
  const rows = got.world === world ? got.rows : []
  const out = rows.some((r) => r.state === 'rendering')
  useEffect(() => {
    if (!out) return
    const t = setInterval(() => setTick((n) => n + 1), POLL_MS)
    return () => clearInterval(t)
  }, [out])
  return rows
}
