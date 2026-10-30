// The Set panel's first row: the ground's shape, Flat | Rolling (plan.ground; stage3d/world.ts heightFn reads it for the mesh, the
// pieces, the mark, the paths, the camera and the server's master view). A world with no choice reads as Rolling, the ground every
// world had before it; a new scene starts Flat. A switch is a set change through the world's own route like the sky's: every piece
// stands on the new ground when the world is rebuilt from it, the approval goes stale (and is approved again by itself) and a
// locked take reads its set changed.
import { useEffect, useState } from 'react'
import type { GroundKind, ScenePlan } from '../../../stage3d/contract'
import { saveKitGround } from '../../../labs/projection/stage3d/kitApi'
import { Seg } from '../../Seg'

export const GROUND_HINT = 'Flat for tracks, floors and streets; Rolling for fields and open country.'
const ITEMS = [{ id: 'flat', label: 'Flat' }, { id: 'rolling', label: 'Rolling' }] as const

export function GroundRow({ worldId, plan, save = saveKitGround, disabled = false }: {
  worldId: string; plan: Pick<ScenePlan, 'ground'>
  /** a locked take with its own set is on show: the row shows its ground, read-only */
  disabled?: boolean
  /** tests: the ground's route */
  save?: (id: string, ground: GroundKind) => Promise<unknown>
}) {
  const [pending, setPending] = useState<GroundKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const saved: GroundKind = plan.ground ?? 'rolling'
  const shown = pending ?? saved
  // the choice shows at once and holds until the world read again carries it (a short wait at most), so it never flicks back
  useEffect(() => {
    if (!pending) return
    if (saved === pending) { setPending(null); return }
    const t = setTimeout(() => setPending(null), 4000)
    return () => clearTimeout(t)
  }, [saved, pending])
  const pick = (g: GroundKind) => {
    if (disabled || pending || g === saved) return
    setPending(g); setError(null)
    save(worldId, g).catch((e: unknown) => { setPending(null); setError(`The ground was not changed: ${e instanceof Error ? e.message : String(e)}`) })
  }
  return (
    <div className="st-ground" data-testid="set-ground-row">
      <span className="st-ground-label">Ground</span>
      <Seg label="Ground" small value={shown} testId="set-ground" onChange={pick}
        items={ITEMS.map((it) => ({ ...it, disabled: disabled || !!pending }))} />
      <p className="st-field-hint" data-testid="set-ground-hint">{GROUND_HINT}</p>
      {error && <p className="st-warn" role="alert" data-testid="set-ground-error">{error}</p>}
    </div>
  )
}
