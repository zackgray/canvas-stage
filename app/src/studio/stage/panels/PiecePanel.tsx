// The Piece panel (merge step 6b; the Stage simplification; the object card wave): the picked piece's name, Remove, and its exact
// numbers as a quiet readout (size in metres and as a multiplier, turn, height). Moving, turning and sizing are done in the view: the gizmo's arrows, or G / R /
// S; swapping and duplicating are on the right-click menu (a later track). Every change is an existing save, so the set key, the
// approval gate and the lock cascade are untouched. A prop's pictures, words and 'Build this in 3D' moved into the one object
// card (PropCard: 'Its pictures' reopens it); every piece keeps 'Bring next to the performer' (a far one, pulled into reach). DOM
// only: nothing here enters the lab scene, so no capture sees it. (add-prop-review) A Stage-made prop's automatic 3D build says
// here where it stands — building, waiting its turn, or refused in plain words — since the card no longer opens on a click.
import { useSyncExternalStore } from 'react'
import { SET_READ_ONLY } from '../../../labs/projection/stage3d/setEditGate'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { AUTO_WAIT, autoBuildsOf, autoBuildsVersion, subscribeAutoBuilds } from '../../scene/pieceAutoBuild'
import { markOf } from '../../../stage3d/mark'
import type { PiecesApi } from '../../scene/piecesApi'
import type { SetPlaceState } from '../../scene/useSetPlace'
import { sizeOf, sizeWords } from '../../scene/pieceScale'
import { nearMark } from '../setBounds'
import { pathLength } from './blocking/blockingMath'
import { PropFront } from './PropFront'

export interface PiecePanelProps {
  /** the one selection's composing state (the Set's own, shared with the viewport's picking) */
  place: SetPlaceState
  /** the lab: its world is the set the pieces route builds into */
  lab?: ProjectionLabState
  /** tests: the pieces route (jsdom has none) */
  pieces?: PiecesApi
  /** the object card again, after the owner closed it (a click on the prop opens it by itself) */
  onOpenCard?: () => void
  /** the card straight on its Advanced tab (front, tilt, travel, speed) */
  onOpenAdvanced?: () => void
  /** (clear-move) the saved move goes: the panel host's one Clear move (the travel tool lets go, the move is written null) */
  onClearMove?: () => void
}

/** the picked piece's panel: its name, Bring next to the performer, Remove, the numbers, and the button into its card */
export function PiecePanel({ place, lab, pieces: _pieces, onOpenCard, onOpenAdvanced, onClearMove }: PiecePanelProps) {
  const item = place.item
  const world = lab?.kit?.world ?? null
  // a locked take on show with its own other set: the set is read-only, so the changes are off up front, the read-only words their tooltip
  const locked = lab?.kit?.ownSet ? SET_READ_ONLY : null
  useSyncExternalStore(subscribeAutoBuilds, autoBuildsVersion, autoBuildsVersion)
  if (!item) return null
  const tag = item.pieceTag?.startsWith('prop:') ? item.pieceTag.slice(5) : null
  const auto = tag && world ? autoBuildsOf(world.id) : null
  const buildLine = !tag || !auto || item.glb ? null
    : auto.busy[tag] ? 'Building it in 3D, about a minute. The labelled stand-in holds its place; the mesh takes over when it lands.'
      : auto.waiting[tag] ? AUTO_WAIT : null
  const buildFailed = tag && auto && !item.glb ? auto.failed[tag] ?? null : null
  const pose = place.sel !== null ? place.poseOf(place.sel) : null
  // its size in metres: the built meshes when the layer has them, else the plan's own estimate
  const size = sizeOf(item, place.sel !== null ? lab?.kit?.layer?.rootOf(place.sel) : null)
  const pct = `${Math.round((item.scale ?? 1) * 100)}%`
  const bring = () => {
    if (place.sel === null || !world) return
    void place.drop(place.sel, { at: nearMark(markOf(world.plan)), yaw: pose?.yaw ?? item.yawDeg ?? 0 })
  }
  return (
    <div className="st-scene" data-testid="piece-panel">
      <section className="st-scene-card">
        <h2>The piece</h2>
        <b data-testid="piece-name">{item.label?.trim() || item.kind}</b>
        <p className="st-muted" data-testid="piece-numbers">
          {`${size ? `${sizeWords(size)} (${pct})` : pct} · turned ${Math.round(pose?.yaw ?? item.yawDeg ?? 0)}° · ${(item.lift ?? 0).toFixed(1)} m high`}
        </p>
        {item.pieceTag?.startsWith('prop:') && (
          <>
            <span className="st-field-hint">Its pictures, words, 3D build and Advanced (front, tilt, travel) live in its card.</span>
            {buildLine && <p className="st-muted" data-testid="piece-build-state">{buildLine}</p>}
            {buildFailed && <p className="st-warn" role="alert" data-testid="piece-build-failed">{buildFailed}</p>}
            <span className="sd-act">
              {onOpenCard && <button type="button" className="st-btn" data-testid="piece-open-card" onClick={onOpenCard}>Its card</button>}
              {onOpenAdvanced && <button type="button" className="st-btn" data-testid="piece-open-advanced" onClick={onOpenAdvanced}>Advanced…</button>}
            </span>
          </>
        )}
        {item.move && (
          <p className="st-muted" data-testid="piece-move">
            {`It moves along a path: ${Math.round(pathLength(item.move.path) * 10) / 10} m at ${item.move.speed} m/s. `}
            {onClearMove && <button type="button" className="st-btn" data-testid="piece-move-clear" onClick={onClearMove} disabled={!!locked}
              title={locked ?? 'It stays where it stands now'}>Clear move</button>}
          </p>
        )}
        <PropFront place={place} lab={lab} compact />
        <div className="sd-act">
          {world && <button type="button" data-testid="piece-bring" onClick={bring} disabled={!!locked} title={locked ?? "Moves it to a spot just in front of the performer's mark"}>Bring next to the performer</button>}
          <button type="button" data-testid="piece-remove" onClick={() => void place.remove()} disabled={!!locked} title={locked ?? undefined}>Remove</button>
        </div>
        {place.error && <p className="st-warn" role="alert" data-testid="piece-error">{place.error}</p>}
      </section>
    </div>
  )
}
