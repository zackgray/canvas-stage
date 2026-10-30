// The draw bar (merge step 7, layout wave L1): the bottom transport row — the one-line transport (DrawTransport) and the take list
// (TakeList, its own line under the transport: coverage, owner 10-28 PM). The shot's presses are the take card's (Draw the first
// frame, beside the Prompt box) and the first-frame window's (Draw another, Render clip; owner 10-29). L1: the bar is a full-width row
// under the stage (StudioView's transport slot), never over the viewport. "Edit this frame" and its version strip are no longer
// drawn here (owner 10-29): they sit under the full-screen first frame (FrameEditDock in HeroOverlay). The bar still HOLDS their
// model — it stays mounted while the Stage is open, so the typed words and a running edit outlive the still view — and hands it
// over through frameEditStore.
import { useEffect, useRef } from 'react'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { useHeroPublished } from '../shoot/heroPublished'
import { DrawTransport } from './DrawTransport'
import { publishFrameEdit } from './frameEditStore'
import { TakeList } from './TakeList'
import { useFrameEdit } from './useFrameEdit'

/** The Stage's transport row: Play, Loop, Rewind and the scrubber, then the take list. */
export function DrawBar({ lab }: { lab: ProjectionLabState }) {
  useFrameEditHolder()
  return (
    <div className="st-drawbar" data-testid="draw-bar">
      <DrawTransport lab={lab} />
      <TakeList lab={lab} />
    </div>
  )
}

/** keeps the edit model alive for the Stage's life and publishes it; a new frame on show (a draw, an approval) is what the still
 *  view shows next, never an older version left picked */
export function useFrameEditHolder(): void {
  const edit = useFrameEdit()
  useEffect(() => { publishFrameEdit(edit) })
  useEffect(() => () => publishFrameEdit(null), [])
  const frameId = useHeroPublished()?.overlay?.still.id ?? null
  const seen = useRef(frameId)
  const { onShow } = edit
  useEffect(() => {
    if (frameId && frameId !== seen.current) onShow(frameId)
    seen.current = frameId
  }, [frameId, onShow])
  // a new version of the same take (Draw another, an edit) is what the window shows next, beside the one in use
  const newest = edit.versions[0]?.id ?? null
  const top = useRef({ take: edit.takeId, id: newest })
  useEffect(() => {
    if (newest && top.current.take === edit.takeId && top.current.id && newest !== top.current.id) onShow(newest)
    top.current = { take: edit.takeId, id: newest }
  }, [edit.takeId, newest, onShow])
}
