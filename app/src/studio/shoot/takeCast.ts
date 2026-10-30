import { useEffect, useState } from 'react'
import { getKitWorld, KIT_CHANGED } from '../../labs/projection/stage3d/kitApi'
import type { TakeRecord } from '../../shared/shotContract'

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

/**
 * Who the take's kit world casts now (performance.json castId, as saved on disk: the same file Render's readiness reads), so Shoot's
 * hero list stales a still drawn for another cast card exactly as Render does. Re-read when a kit world's files change (Played by
 * saves fire KIT_CHANGED). `undefined` = not known (no take, not a kit world, not read yet): no cast check, as Render on a pack world.
 */
export function useTakeCast(take: Pick<TakeRecord, 'id' | 'worldId'> | null, f?: Fetch): string | null | undefined {
  const world = take ? take.worldId.replace(/^.*\//, '') : null
  const [cast, setCast] = useState<{ world: string; castId: string | null } | null>(null)
  useEffect(() => {
    if (!world || !/^loc-/.test(world)) return
    let alive = true
    // an answer without a performance is no kit world: the cast stays unknown
    const read = () => {
      getKitWorld(world, f).then((w) => { if (alive && w?.perf) setCast({ world, castId: w.perf.castId ?? null }) }).catch(() => { /* not a kit world */ })
    }
    read()
    const on = (e: Event) => { const id = (e as CustomEvent<{ id?: string }>).detail?.id; if (!id || id === world) read() }
    window.addEventListener(KIT_CHANGED, on)
    return () => { alive = false; window.removeEventListener(KIT_CHANGED, on) }
  }, [world, f])
  return cast && cast.world === world ? cast.castId : undefined
}
