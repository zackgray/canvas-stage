// The set panel (layout wave L4): the Stage's right panel with nothing picked, in Free view / Top View — the ground, the set's
// approval and Reset the set (the mock's right panel; the full shot card and the scene-level rows stay on the Camera view's panel).
// The set is approved for you when it is built; if the pieces move afterwards the Stage approves it again by itself, and this panel
// keeps one plain button for the case it could not (a stale approval says so and offers Approve the changed set, free). The master
// look is no longer drawn from the UI. The hook wiring mirrors the old Set column's (same routes, same reload-on-change), so the
// approval state stays true after any set change; Approve also re-renders the clay view, as there. Reset the set empties the
// world, so it asks first. An empty world (the Stage's starting world) has no approval and no Reset the set until a piece is placed.
// The sun control is unmounted here too (sun-is-preview): one default 3D light, nothing that does not change the draw.
import { useEffect, useMemo, useRef, useState } from 'react'
import { getKitWorld, KIT_CHANGED, resetKitPlan, uploadKitStill } from '../../../labs/projection/stage3d/kitApi'
import { renderKitStill } from '../../../labs/projection/stage3d/kitStill'
import type { GroundKind } from '../../../stage3d/contract'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { JobLine } from '../../../jobs/JobLine'
import { Ask } from '../../ui'
import { ApproveSet } from '../../scene/SetApprove'
import type { BibleApi } from '../../scene/bibleApi'
import type { KitBuildDeps } from '../../kit/useKitBuild'
import type { PiecesApi } from '../../scene/piecesApi'
import { usePieces, type StillDeps } from '../../scene/usePieces'
import { useScene } from '../../scene/useScene'
import type { SetPlaceState } from '../../scene/useSetPlace'
import type { StagePick } from '../useStagePick'
import { FindPieces } from './FindPieces'
import { GroundRow } from './GroundRow'
import { OwnSetApprove } from './OwnSetApprove'

export interface SetPanelProps {
  lab: ProjectionLabState
  /** the Bible routes and the kit build's steps, as the Scene screen's set screen takes them (production defaults) */
  api?: BibleApi
  kit?: KitBuildDeps
  /** tests: the pieces read (jsdom has no route) */
  pieces?: PiecesApi
  /** tests: Reset the set's route */
  reset?: (id: string) => Promise<unknown>
  /** tests: the Ground row's route */
  ground?: (id: string, g: GroundKind) => Promise<unknown>
  /** the Find list: the Stage's selection (absent = no list) */
  place?: SetPlaceState
  select?: (p: StagePick | null) => void
}

/** nothing picked, in Free view / Top View: the set's approval and Reset the set — nothing else */
export function SetPanel({ lab, api, kit, pieces: piecesDeps, reset = resetKitPlan, ground, place, select }: SetPanelProps) {
  const worldId = lab.kit?.id ?? null
  const kw = lab.kit?.world && lab.kit.world.id === worldId ? lab.kit.world : null
  const placed = (kw?.plan.kit.length ?? 0) > 0
  // a locked take on show with its own set: the panel shows that set, read-only (the banner over the panel offers the scene's)
  const frozen = !!lab.kit?.ownSet
  const read = kit?.read ?? getKitWorld
  const s = useScene(worldId, api)
  const still = useMemo<StillDeps>(() => ({ read, render: kit?.still ?? renderKitStill, upload: kit?.upload ?? uploadKitStill }), [kit]) // eslint-disable-line react-hooks/exhaustive-deps -- read follows kit
  const pieces = usePieces(worldId, piecesDeps, still)
  // Approve the set also renders the clay view again (free), so every still.png shown afterwards is the set that was approved
  const approved = useMemo(() => ({ ...s, approveSet: () => { void pieces.redraw().catch(() => { /* the stale-still redraw tries again */ }); return s.approveSet() } }), [s, pieces.redraw]) // eslint-disable-line react-hooks/exhaustive-deps
  // a piece built or moved changes the set's key: read the Bible and the key again so the approval shows stale at once (a piece
  // landing or a drag fires KIT_CHANGED; another page's change shows in the pieces' own setChangedAt)
  const moved = pieces.data?.setChangedAt ?? null
  const seen = useRef(moved)
  useEffect(() => { if (seen.current !== moved) { seen.current = moved; void s.reload() } }, [moved, s.reload]) // eslint-disable-line react-hooks/exhaustive-deps -- reload is stable per world
  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent<{ id?: string }>).detail?.id === worldId) void s.reload() }
    window.addEventListener(KIT_CHANGED, on)
    return () => window.removeEventListener(KIT_CHANGED, on)
  }, [worldId, s.reload]) // eslint-disable-line react-hooks/exhaustive-deps -- reload is stable per world
  // Reset the set (free): every piece and the mark back where the set was built (on the Stage's own world, nothing): it asks first
  const [asking, setAsking] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const doReset = () => {
    setAsking(false)
    if (!worldId) return
    setResetting(true); setResetError(null)
    reset(worldId).catch((e: unknown) => setResetError(`The set was not reset: ${e instanceof Error ? e.message : String(e)}`)).finally(() => setResetting(false))
  }
  return (
    <div className="st-scene" data-testid="scene-panel">
      <section className="st-scene-card" data-testid="card-set">
        <h2>The set</h2>
        {!worldId && <p className="st-muted" data-testid="scene-no-world">No set yet: place pieces from the rail.</p>}
        {worldId && kw && <GroundRow worldId={worldId} plan={kw.plan} save={ground} disabled={frozen} />}
        {/* an empty world (the Stage's own starting world) has nothing to approve or reset: only the lay-out press tells the truth */}
        {worldId && placed && !frozen && <ApproveSet s={approved} />}
        {/* (review F1) a take's own set on show: Approve is for that set, by its key and the take's name */}
        {worldId && placed && lab.kit?.ownSet?.setKey && <OwnSetApprove s={s} worldId={worldId} own={{ takeId: lab.kit.ownSet.takeId, setKey: lab.kit.ownSet.setKey }} />}
        {worldId && placed && !frozen && (
          <div className="st-actions">
            {asking
              ? <Ask label="Reset the set" yes="Reset" no="Cancel" testId="set-reset-ask" onYes={doReset} onNo={() => setAsking(false)}>Reset the set? This removes every piece.</Ask>
              : <button type="button" className="st-btn" data-testid="set-reset" disabled={resetting} onClick={() => setAsking(true)}
                  title="Removes every piece and puts the person back at the start (free); it asks first">Reset the set</button>}
          </div>
        )}
        {resetError && <p className="st-warn" role="alert" data-testid="set-reset-error">{resetError}</p>}
        {kw && <FindPieces world={kw} place={place} select={select} />}
        <JobLine line={s.error} testId="scene-error" onRecovered={() => void s.reload()} />
        {s.note && <p className="st-muted" data-testid="scene-note">{s.note}</p>}
      </section>
    </div>
  )
}
