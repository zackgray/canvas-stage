// The Stage's one selection (the merge, steps 4–5; layout waves L2–L3): the same pick-and-drag the Set's own live views have, on
// the lab viewport's kit layer, identical in every pane — a press is cast through the pane under it (engine/panes.ts), so a drag
// begun in the Top View lands exactly where it would in the Camera. Clicking a piece or the mark boxes+names it; dragging moves it
// live (the grabbed spot rides the pointer, dragPlane.ts) and saves once on drop, through the Set's own saves (movePiece /
// setPlaceApi.mark). A left-click on empty ground lets go of the pick and closes any menu. Menus come from a right-click only
// (W3-E2 renders them in StagePanel): empty ground in the Free view marks the spot (the dashed ring in every pane, hidden from
// every capture like the pick box) and opens "Add here" beside the cursor; a piece is picked and opens its menu (Move to a spot /
// Edit look / Duplicate / Remove; a plain piece swaps); the person is picked and opens theirs (Walk to a spot / Slow walk / Run /
// Hold here / Edit look). Any left-click or Esc closes a menu. The picked thing's name and the Top View's overlay live in
// usePickOverlays.ts. The hook defers to an armed operator
// gesture; a structural KIT_CHANGED re-read replaces the layer, and the selection is re-resolved by index. L2: a figure double-click (the performer or a prop) hands the hit to
// `onFigureDbl`, which opens the rail's card viewer on it; the press is consumed only when the callback says the viewer opened.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { dragTo, type Grab } from '../../stage3d/dragPlane'
import { placeApi, plainSay, type NewPiece, type PlaceApi } from '../scene/setPlaceApi'
import { readOnlySet } from '../../labs/projection/stage3d/setEditGate'
import { type Pose, type SetPick } from '../scene/live/liveSet'
import { useSetPlace } from '../scene/useSetPlace'
import { groundHit } from './panels/blocking/groundClick'
import { isGroundDrawing } from './groundDrawing'
import { usePickOverlays } from './usePickOverlays'
import { useStageTool, type ActiveTool } from './useStageTool'
import { type AddKind, type MenuChoice, type StageMark } from './railBus'
import { KitPick } from '../../labs/projection/stage3d/kitPick'
import { isMocapLayer } from '../../labs/projection/stage3d/MocapLayer'
import type { StagePick } from '../../labs/projection/stage3d/kitPick'

export type { StagePick } from '../../labs/projection/stage3d/kitPick'

const CLICK_PX = 4
/** metres to the right a duplicated piece lands beside its original */
export const DUPLICATE_DX = 0.8
/** a request for the picked thing's card: `n` counts, so the same pick asked twice is two requests */
export interface CardAsk { pick: StagePick; why: 'click' | 'open'; n: number }
/** whether a card request opens the card of the current pick: a double-click always; a click only on a person nobody plays */
export function asksCard(a: CardAsk | null | undefined, pick: StagePick | null, nobodyCast: boolean): boolean {
  if (!a || !pick || a.pick.t !== pick.t || (a.pick.t === 'piece' && pick.t === 'piece' && a.pick.index !== pick.index)) return false
  return a.why === 'open' || (a.pick.t === 'mark' && nobodyCast)
}
interface Drag { pick: SetPick; grab: Grab; start: Pose; pose: Pose; moved: boolean }

const VERB = { move: 'Moving', rotate: 'Turning', scale: 'Sizing' } as const
/** the small pill under the picked thing's name: the keys it takes, or what the running tool does and how it ends */
export function toolHint(pick: SetPick | null, tool: ActiveTool | null): string | null {
  if (tool) return `${VERB[tool.kind]}${tool.axis ? ` along ${tool.axis.toUpperCase()}` : ''} · click or Enter keeps it · Esc cancels`
  if (pick === null) return null
  return pick === 'mark' ? 'G move · R rotate' : 'G move · R rotate · S scale'
}

const toStagePick = (p: SetPick | null): StagePick | null => (p === null ? null : p === 'mark' ? { t: 'mark' } : { t: 'piece', index: p })

/** a ray through a client point of the stage's canvas, from the camera of the pane under it (panes.ts) */
function rayAt(stage: ProjectionLabState['stage'], clientX: number, clientY: number) {
  return stage!.panes.rayAt(clientX, clientY)
}

/**
 * One pick for the Stage screen: selection, live poses and drop-saves through useSetPlace (the Set's own state, so the saves and
 * their refusals behave exactly as on the Scene route); applied to the kit layer via a KitPick, which is rebuilt with the layer
 * and re-selected by index. Pointer listeners sit on the canvas' parent in the capture phase: a hit stops the press before the
 * canvas' listeners (the orbit, Blocking's ground click) see it; a miss never reaches for them until it proves a click.
 */
export function useStagePick(lab: ProjectionLabState, api: PlaceApi = placeApi, onFigureDbl?: (pick: { t: 'mark' } | { t: 'piece'; index: number }) => boolean) {
  const p = useSetPlace(lab.kit.world, api)
  const stage = lab.stage
  const layer = lab.kit.layer
  const view = useRef<KitPick | null>(null)
  const drag = useRef<Drag | null>(null)
  const down = useRef<{ x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  const placeLabel = useRef<() => void>(() => {})
  const live = useRef<{ lab: ProjectionLabState; p: typeof p; onFigureDbl: typeof onFigureDbl; hint: string | null }>({ lab, p, onFigureDbl, hint: null })
  // the move gizmo's arrows and the G / R / S keys: their listeners register before the pick's, so an arrow's press is the tool's
  const tool = useStageTool(stage, view, live)
  useEffect(() => { live.current = { lab, p, onFigureDbl, hint: toolHint(p.pick, tool) } })
  // the marked spot (a right-click on empty ground in the Free view): the ring rides the kit layer, the menu the cursor beside
  // it; choosing a kind keeps the mark and opens the rail in Add mode on it
  const [mark, setMark] = useState<StageMark | null>(null)
  const [addKind, setAddKind] = useState<AddKind | null>(null)
  // a right-clicked piece's menu (Move to a spot / Edit look / Duplicate / Remove; a plain piece swaps) beside the cursor
  const [pieceMenu, setPieceMenu] = useState<StageMark | null>(null)
  // the person's menu (Walk to a spot / Slow walk / Run / Hold here / Edit look) beside the cursor
  const [personMenu, setPersonMenu] = useState<StageMark | null>(null)
  // card-on-click (owner 2026-10-29): what asked for the thing's card last — a pure click on a figure (no drag) or a DOM pick
  // ('click': the panel host opens the card only for a person nobody plays yet), or a double-click ('open': always). A press that
  // moved the pointer is a drag and asks nothing.
  const [cardAsk, setCardAsk] = useState<CardAsk | null>(null)
  const ask = useCallback((pick: StagePick, why: CardAsk['why']) => setCardAsk((a) => ({ pick, why, n: (a?.n ?? 0) + 1 })), [])
  const askRef = useRef(ask)

  // a KitPick per kit layer: the mark stand-in, the dashed ring and the pick box live and die with the layer that owns them
  useEffect(() => {
    if (!layer) { view.current = null; placeLabel.current(); return }
    const v = new KitPick(layer)
    view.current = v
    v.setPoses(live.current.p.poses)
    v.select(toStagePick(live.current.p.pick))
    placeLabel.current()
    return () => { view.current = null; v.dispose() }
  }, [layer]) // eslint-disable-line react-hooks/exhaustive-deps -- the poses, pick, mark and label below re-apply on their own changes

  // the selection, the mark and the live poses, drawn on the kit group (the one scene every pane shows)
  useEffect(() => { view.current?.select(toStagePick(p.pick)); placeLabel.current() }, [layer, p.pick])
  useEffect(() => { view.current?.setPoses(p.poses); placeLabel.current() }, [layer, p.poses])
  useEffect(() => { view.current?.setMark(mark?.at ?? null) }, [layer, mark])
  // the 3D performer is the person: a click on the figure picks the mark, and the grey stand-in hides under it
  const figure = isMocapLayer(lab.performance?.layer) ? lab.performance.layer.object : null
  // while her figure loads the grey stand-in waits (only its wedge shows): it stands in only when no 3D performer is coming
  const coming = !figure && !!lab.performance?.mocapExpected
  useEffect(() => { view.current?.setPerformer(figure, coming); placeLabel.current() }, [layer, figure, coming])

  // the floating name and the Top View's SVG layer (DOM over the canvas; nothing enters the scene)
  usePickOverlays(stage, live, view, placeLabel)

  // the viewport's pointer pipeline; defer() stands the pick down while an operator gesture owns the canvas
  useEffect(() => {
    if (!stage) return
    const canvas = stage.renderer.domElement
    const host = canvas.parentElement
    if (!host) return
    const closeMenus = () => { setMark(null); setAddKind(null); setPieceMenu(null); setPersonMenu(null) }
    // in the Camera pane the operator's gestures own a press; the Free and Top panes are the pick's whatever the camera mode
    const deferred = (e: MouseEvent) => !!document.pointerLockElement
      || (live.current.lab.op.mode === 'operator' && stage.panes.at(e.clientX, e.clientY) === 'camera')
    const px = (e: MouseEvent) => { const r = host.getBoundingClientRect(); return { x: e.clientX - r.left + 8, y: e.clientY - r.top + 8 } }
    const onDown = (e: PointerEvent) => {
      const v = view.current
      if (e.target !== canvas || e.button !== 0) return
      closeMenus() // any left-click closes a menu
      if (!v || deferred(e)) return
      // (QA run 5, F2) while a path draw is on, every press is its own: no pick, no let-go
      if (isGroundDrawing()) return
      down.current = { x: e.clientX, y: e.clientY }
      const hit = v.hit(rayAt(stage, e.clientX, e.clientY))
      if (!hit) return // a miss is left to the orbit until it proves a click (onUp)
      e.stopPropagation() // a hit's press is the pick's, never the orbit's
      suppressClick.current = true
      const pick = hit.pick.t === 'piece' ? hit.pick.index : 'mark'
      live.current.p.select(pick)
      const start = v.poseOf(hit.pick)
      // a locked take on show with its own set: a press picks, never drags (setEditGate.ts)
      if (!start || readOnlySet(live.current.lab.kit.id)) return
      drag.current = { pick, grab: { spot: hit.spot, start: start.at }, start, pose: start, moved: false }
      canvas.setPointerCapture?.(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      const d = drag.current, v = view.current
      if (!d || !v) return
      const at = down.current
      if (!d.moved && at && Math.hypot(e.clientX - at.x, e.clientY - at.y) < CLICK_PX) return // a press, not a drag yet
      const to = dragTo(rayAt(stage, e.clientX, e.clientY).ray, d.grab, v.layer.groundAt)
      if (!to) return // past the horizon or the set's reach: it holds where it was
      d.pose = { at: to, yaw: d.start.yaw }
      d.moved = true
      live.current.p.setLive(d.pick, d.pose)
    }
    const onUp = (e: PointerEvent) => {
      const d = drag.current, at = down.current
      drag.current = null; down.current = null
      canvas.releasePointerCapture?.(e.pointerId)
      if (d) {
        if (d.moved) void live.current.p.drop(d.pick, d.pose)
        else if (at && Math.hypot(e.clientX - at.x, e.clientY - at.y) < CLICK_PX) askRef.current(toStagePick(d.pick)!, 'click')
        return
      }
      if (!at || Math.hypot(e.clientX - at.x, e.clientY - at.y) >= CLICK_PX) return // a drag orbits
      if (isGroundDrawing()) return // a path draw keeps its clicks, and the subject stays picked so the draw stays on
      live.current.p.select(null) // a click on empty ground or the sky lets go
    }
    const onClick = (e: MouseEvent) => {
      if (!suppressClick.current) return
      suppressClick.current = false
      e.stopPropagation() // the click that ends a consumed press is not a ground click either
    }
    // a right-click: on a piece, its menu (Move to a spot / Edit look / Duplicate / Remove; a plain piece swaps); on the person,
    // theirs (Walk to a spot / Slow walk / Run / Hold here / Edit look); on empty ground in the Free view, the spot is marked and
    // "Add here" opens beside it
    const onCtx = (e: MouseEvent) => {
      if (e.target !== canvas) return
      e.preventDefault()
      const v = view.current
      if (!v || deferred(e) || isGroundDrawing()) return
      closeMenus()
      const hit = v.hit(rayAt(stage, e.clientX, e.clientY))
      // a locked take on show with its own set: no piece menu, no Add here (the person's menu edits the scene's walk, as ever)
      const frozen = !!readOnlySet(live.current.lab.kit.id)
      if (hit?.pick.t === 'piece' && frozen) { live.current.p.select(hit.pick.index); e.stopPropagation(); return }
      if (hit?.pick.t === 'piece') {
        const it = live.current.lab.kit.world?.plan.kit[hit.pick.index]
        live.current.p.select(hit.pick.index)
        setPieceMenu({ at: it ? [it.at[0], it.at[1]] : [0, 0], px: px(e), kind: null, piece: { index: hit.pick.index, swap: !it?.glb } })
        e.stopPropagation()
        return
      }
      if (hit) {
        live.current.p.select('mark')
        const at = live.current.p.poseOf('mark')?.at ?? [0, 0]
        setPersonMenu({ at: [at[0], at[1]], px: px(e), kind: null, person: true })
        e.stopPropagation()
        return
      }
      if (frozen || stage.panes?.at?.(e.clientX, e.clientY) !== 'free') return // the Add menu belongs to the Free view
      const ray = rayAt(stage, e.clientX, e.clientY).ray
      const pt = groundHit(ray.origin, ray.direction, v.layer.groundAt)
      if (!pt) return
      live.current.p.select(null)
      setMark({ at: pt, px: px(e), kind: null })
      e.stopPropagation()
    }
    // L2: a figure double-click (the performer or a built prop) opens the card viewer on it; only a consumed press stops
    // short of the canvas' own double-click (the orbit pivot's re-place)
    const onDbl = (e: MouseEvent) => {
      if (e.target !== canvas || !view.current || deferred(e)) return
      const hit = view.current.hit(rayAt(stage, e.clientX, e.clientY))
      if (!hit) return
      const sp = hit.pick.t === 'piece' ? { t: 'piece' as const, index: hit.pick.index } : { t: 'mark' as const }
      if (!live.current.onFigureDbl?.(sp)) return
      askRef.current(sp, 'open')
      e.stopPropagation()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenus() }
    const handlers: [string, EventListener][] = [
      ['pointerdown', onDown as EventListener], ['pointermove', onMove as EventListener], ['pointerup', onUp as EventListener],
      ['click', onClick as EventListener], ['contextmenu', onCtx as EventListener], ['dblclick', onDbl as EventListener],
    ]
    for (const [ev, fn] of handlers) host.addEventListener(ev, fn, true)
    window.addEventListener('keydown', onKey)
    return () => {
      for (const [ev, fn] of handlers) host.removeEventListener(ev, fn, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [stage])

  /** a copy of the piece beside it (same kind, look, turn, size, height and words; not the brief's prop tag), then picked */
  const duplicate = async (index: number) => {
    const w = lab.kit.world, it = w?.plan.kit[index]
    if (!w || !it) return
    const { pieceTag: _tag, at, ...rest } = it
    try {
      await api.add(w.id, { ...rest, at: [Math.round((at[0] + DUPLICATE_DX) * 100) / 100, at[1]] } as NewPiece)
      p.select(w.plan.kit.length)
    } catch (e) { p.setError(`${it.kind} was not duplicated: ${plainSay(e instanceof Error ? e.message : String(e))}`) }
  }

  const pick: StagePick | null = toStagePick(p.pick)
  const select = (sp: StagePick | null) => {
    setMark(null); setAddKind(null); setPieceMenu(null); setPersonMenu(null)
    p.select(sp?.t === 'piece' ? sp.index : sp?.t === 'mark' ? 'mark' : null)
    if (sp) ask(sp, 'click') // a pick from the page (the status words, the Find list) is a click
  }
  /** a menu press: the piece and ground commands act here; the person and travel ones are the panel host's (StagePanel) */
  const choose = (k: MenuChoice) => {
    const i = pieceMenu?.piece?.index
    setPieceMenu(null)
    setPersonMenu(null)
    if (k.do === 'close') { setMark(null); setAddKind(null); return }
    if (k.do === 'duplicate' && i !== undefined) void duplicate(i)
    else if (k.do === 'delete' && i !== undefined) void p.remove()
    else if (k.do === 'add') setAddKind(k.kind)
    else if (k.do === 'swap') void p.swap(k.kind)
  }
  const chooseRef = useRef(choose)
  chooseRef.current = choose
  const stableChoose = useCallback((k: MenuChoice) => chooseRef.current(k), [])
  /** drop the mark and the chosen kind without touching the place pick (a placed piece stays selected) */
  const clearMark = useCallback(() => { setMark(null); setAddKind(null) }, [])
  /** the open menu: the piece's, else the person's, else the marked spot's (with its chosen kind) */
  const menu: StageMark | null = pieceMenu ?? personMenu ?? (mark ? { ...mark, kind: addKind } : null)
  return { pick, select, error: p.error, p, mark, menu, addKind, choose: stableChoose, clearMark, tool, cardAsk }
}
