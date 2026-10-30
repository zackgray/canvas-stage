import type { ReactNode } from 'react'
import { useTicker } from '../../labs/controller/ui/useTicker'
import { isMocapLayer } from '../../labs/projection/stage3d/MocapLayer'
import type { TakeLockRequest } from '../../shared/shotContract'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { PriceButton } from '../ui'
import { appearanceOf, frame0Key } from './frame0Key'
import { useTakeLock } from './takeLock'
import { framesBehindSet, SET_BEHIND, useClayExport } from './takeClay'
import { useCurrentTakeId } from './currentTake'
import { useUnlockedTake } from './unlockedTake'
import { useLockedTakes, useRestoreTake } from './worldTakes'

/**
 * Wave B T1 (docs/wave-b-contract.md), slimmed for the Stage: lock the operator's latest take to disk (shots/<id>/take.json) with
 * one button and one line of status. The lock is what the first frame and Render build on; "changed since lock" means the take in
 * memory no longer opens on the locked frame (start pose, lens or performance frame) or runs a different length. The take's 3D set
 * frames are prepared when the first frame is drawn (stillPrep.ensure, free), never by a press here; a piece built or moved after
 * they were made is not a new take: the block says so, and the next draw prepares them again from the set as it stands.
 */
/** `primary`: Lock take is the yellow press (the Stage: only while locking is the next step). `cue`: the next-step line the panel
 *  shows under the block; a "changed since lock" line takes its place, so the panel never says the same thing twice */
/** `locked`: what the block says for a locked take in place of "Take locked." (the Camera panel's one line with its New take) */
export function TakeLockBlock({ lab, primary = false, cue = null, locked = null }: { lab: ProjectionLabState; primary?: boolean; cue?: ReactNode; locked?: ReactNode }) {
  useTicker(4)
  const take = lab.op.engine.deck.take
  const pack = lab.performance.layer?.pack ?? null
  // what frame 0 shows (the 3D figures posed there, the kit set): sent at the press, so an unchanged frame 0 keeps its opening still
  const mocap = isMocapLayer(lab.performance.layer) ? lab.performance.layer : null
  const kitPlan = lab.stage?.kit?.plan
  const frame0 = (q: TakeLockRequest) => frame0Key(q, pack, mocap?.performer ?? null, kitPlan ? { plan: kitPlan, look: appearanceOf(mocap?.plan ?? null) } : null)
  const lk = useTakeLock(take, pack, lab.s.source, lab.stage?.view.aspect ?? 16 / 9, undefined, frame0, kitPlan ?? null, mocap?.plan ?? null)
  // a reload empties the engine but not the disk: with nothing recorded, the world's newest locked take is the current one again
  // (and the unlocked take recorded before the reload is put back first: it is the newer work)
  const takes = useLockedTakes(lab.s.source)
  useUnlockedTake(lab.op.engine.deck, lab.s.source, !!lk.locked && !lk.changed, take)
  useRestoreTake(take, lk.locked?.id, takes)
  const cur = useCurrentTakeId()
  const shown = lk.locked ?? (take ? null : takes.find((t) => t.id === cur) ?? null)
  // the take's frames show the set as it was before a piece was built or moved: the draw prepares them again (same take, free)
  const behind = framesBehindSet(useClayExport(null, shown, null, lab.s.source).clay)
  if (!take && !shown) return <>{cue}</>
  const recording = lab.op.engine.deck.recording
  const req = lk.cur && 'request' in lk.cur ? lk.cur.request : null
  const isLocked = !!shown && !lk.changed
  return (
    <section className="st-takelock" data-testid="take-lock">
      {lk.cur && 'error' in lk.cur && <p className="st-warn" data-testid="take-lock-refused">{lk.cur.error}</p>}
      {!isLocked && req && (
        <PriceButton primary={primary} verb="Lock take" price="Free" testId="take-lock-btn" disabled={lk.busy || recording}
          title="Keep this take: its first frame and its render are made from the locked take" onClick={() => { void lk.lock() }} />
      )}
      {isLocked && <p className="st-muted" data-testid="take-locked">{locked ?? 'Take locked.'}</p>}
      {isLocked && behind && <p className="st-warn" data-testid="take-set-behind">{SET_BEHIND}</p>}
      {lk.changed ? <p className="st-warn" data-testid="take-changed">{lk.worldMoved ?? lk.perfMoved ?? 'Changed since lock: lock the take again to use it.'}</p> : cue}
      {lk.error && <p className="st-warn">{lk.error}</p>}
    </section>
  )
}
