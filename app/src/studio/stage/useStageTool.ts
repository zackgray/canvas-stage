// The Stage's transform tools on the picked thing (steps 12, 13): drag one of the move gizmo's arrows (Free view and Top View) and the
// thing moves along that world axis only — X and Z on the ground, Y a piece's height. Or, with the pointer over the Free view or the
// Top View, the keys: G grabs it (it follows the pointer on the ground), R turns it, S sizes it (pieces only); X / Y / Z hold a move
// to one axis; Enter or a click keeps the change, Esc or a right-click cancels it; Delete removes the piece. Keys typed into a field
// are never ours, and the tool's keys never reach the camera's (S is not "back", R is not Record). Shown live in every pane (a live
// pose, or the object's own height and size while the tool runs) and saved once through the Set's own saves (the move route, the
// piece's lift or size). Listeners sit on the canvas' parent in the capture phase, registered before the pick's own, so a press on
// an arrow (or the press that ends a key tool) is the tool's and never a pick, a drag of the orbit, or a menu.
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Object3D } from 'three'
import type { KitItem } from '../../stage3d/contract'
import type { Stage } from '../../labs/projection/engine/Stage'
import type { KitPick } from '../../labs/projection/stage3d/kitPick'
import { alongAxis, AXIS_DIR, GIZMO_LAYER, type Axis } from '../../labs/projection/stage3d/moveGizmo'
import type { SetPick } from '../scene/live/liveSet'
import type { SetPlaceState } from '../scene/useSetPlace'
import { typingTarget } from '../useStudioKeys'
import { groundHit } from './panels/blocking/groundClick'
import { clampScale } from '../scene/pieceScale'
import { toolResult, type ToolKind, type ToolResult, type ToolStart } from './stageToolMath'

/** the plan scale a piece is drawn at (a generated mesh's root carries unitScale x scale): what the size tool starts from, so a
 *  second size before the first save's re-read lands builds on what is shown, not on the plan read before it */
const drawnScale = (objScale: number, it: KitItem | null) => (it ? Math.round((objScale / (it.glb?.unitScale ?? 1)) * 10000) / 10000 : 1)

/** the tool in use, as the label says it; null when none */
export interface ActiveTool { kind: ToolKind; axis: Axis | null; via: 'drag' | 'key' }

/** scale0: the object's drawn scale when the tool began; item0: the piece's plan scale then (the size tool saves item0 x its factor) */
interface Running extends ActiveTool { pick: SetPick; start: ToolStart; obj: Object3D; y0: number; scale0: number; item0: number; last: ToolResult | null }

export function useStageTool(stage: Stage | null | undefined, view: RefObject<KitPick | null>, live: RefObject<{ p: SetPlaceState }>) {
  const [shown, setShown] = useState<ActiveTool | null>(null)
  const cur = useRef<Running | null>(null)

  useEffect(() => {
    if (!stage) return
    const canvas = stage.renderer.domElement
    const host = canvas.parentElement
    if (!host) return
    // only the Free and Top panes see the arrows (the Camera pane and every capture use the view camera)
    stage.panes.free.layers.enable(GIZMO_LAYER)
    stage.panes.top.layers.enable(GIZMO_LAYER)
    const arranging = (e: MouseEvent) => { const p = stage.panes.at(e.clientX, e.clientY); return p === 'free' || p === 'top' }
    const cast = (e: MouseEvent) => { const rc = stage.panes.rayAt(e.clientX, e.clientY); rc.layers.enable(GIZMO_LAYER); return rc }
    const groundOf = (e: MouseEvent) => {
      const v = view.current, ray = cast(e).ray
      return v ? groundHit(ray.origin, ray.direction, v.layer.groundAt) : null
    }
    const begin = (kind: ToolKind, axis: Axis | null, via: ActiveTool['via'], e: MouseEvent): boolean => {
      const v = view.current, p = live.current!.p
      if (!v || p.pick === null) return false
      const sp = p.pick === 'mark' ? { t: 'mark' as const } : { t: 'piece' as const, index: p.pick }
      const pose = v.poseOf(sp), obj = v.objectOf(sp)
      if (!pose || !obj) return false
      const start: ToolStart = { at: pose.at, yaw: pose.yaw, mouse: { x: e.clientX, y: e.clientY }, ground: groundOf(e), origin: obj.position.clone(),
        s0: axis ? alongAxis(cast(e).ray, obj.position, AXIS_DIR[axis]) : null }
      cur.current = { kind, axis, via, pick: p.pick, start, obj, y0: obj.position.y, scale0: obj.scale.x, item0: drawnScale(obj.scale.x, p.item), last: null }
      setShown({ kind, axis, via })
      return true
    }
    /** the plan scale a size factor gives the picked piece, held to its range */
    const sizedTo = (t: Running, f: number) => { const it = live.current!.p.item; return it ? clampScale(it, t.item0 * f) : t.item0 * f }
    const update = (e: MouseEvent) => {
      const t = cur.current
      if (!t) return
      const r = toolResult(t.kind, t.axis, t.start, { x: e.clientX, y: e.clientY }, cast(e).ray, groundOf(e))
      t.last = r
      // the size is drawn as it will be saved: held to the piece's range (pieceScale.ts), so letting go never snaps it
      if (t.kind === 'scale') t.obj.scale.setScalar(t.scale0 * sizedTo(t, r.scale) / t.item0)
      else if (t.axis === 'y') t.obj.position.y = t.y0 + r.lift
      else live.current!.p.setLive(t.pick, { at: r.at, yaw: r.yaw })
    }
    /** keep (save once) or cancel (everything back where it was) */
    const end = (keep: boolean) => {
      const t = cur.current
      cur.current = null
      setShown(null)
      if (!t) return
      const p = live.current!.p, r = t.last
      if (!keep || !r) { t.obj.scale.setScalar(t.scale0); t.obj.position.y = t.y0; p.setLive(t.pick, null); return }
      if (t.kind === 'scale') void p.scaleTo(t.item0 * r.scale)
      else if (t.axis === 'y') void p.liftBy(r.lift)
      else void p.drop(t.pick, { at: r.at, yaw: r.yaw })
    }
    // the keys: only with the pointer last over the Free view or the Top View, and something picked
    let last: MouseEvent | null = null
    let swallowMenu = false
    const KINDS: Record<string, ToolKind> = { KeyG: 'move', KeyR: 'rotate', KeyS: 'scale' }
    const AXES: Record<string, Axis> = { KeyX: 'x', KeyY: 'y', KeyZ: 'z' }
    const consume = (e: Event) => { e.preventDefault(); e.stopImmediatePropagation() }
    const onKey = (e: KeyboardEvent) => {
      if (typingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      const t = cur.current, p = live.current!.p
      if (t) {
        if (e.key === 'Enter') { consume(e); end(true); return }
        if (e.key === 'Escape') { consume(e); end(false); return }
        const axis = AXES[e.code]
        if (!axis) { if (KINDS[e.code]) consume(e); return }
        consume(e)
        if (t.kind !== 'move' || (axis === 'y' && t.pick === 'mark')) return
        // a new axis starts from where the thing began, measured from the pointer now (the same axis again lets it go free)
        t.obj.position.y = t.y0
        t.axis = t.axis === axis ? null : axis
        if (last) t.start = { ...t.start, mouse: { x: last.clientX, y: last.clientY }, ground: groundOf(last),
          s0: t.axis ? alongAxis(cast(last).ray, t.start.origin, AXIS_DIR[t.axis]) : null }
        setShown({ kind: t.kind, axis: t.axis, via: t.via })
        if (last) update(last)
        return
      }
      if (p.pick === null || !last || !arranging(last)) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && p.pick !== 'mark') { consume(e); void p.remove(); return }
      const kind = KINDS[e.code]
      if (!kind || (kind === 'scale' && p.pick === 'mark')) return
      consume(e)
      begin(kind, null, 'key', last)
    }
    const onCtx = (e: MouseEvent) => { if (swallowMenu) { swallowMenu = false; consume(e) } }
    const onDown = (e: PointerEvent) => {
      if (cur.current?.via === 'key') {
        // a click keeps the change, a right-click cancels it: either way the press is the tool's
        consume(e)
        if (e.button === 2) swallowMenu = true
        end(e.button !== 2)
        return
      }
      if (e.target !== canvas || e.button !== 0 || cur.current || !arranging(e)) return
      const axis = view.current?.hitGizmo(cast(e)) ?? null
      if (!axis || !begin('move', axis, 'drag', e)) return
      e.stopImmediatePropagation() // the arrow's press: never a pick, the orbit, or a menu
      canvas.setPointerCapture?.(e.pointerId)
    }
    const onMove = (e: PointerEvent) => { last = e; if (cur.current) update(e) }
    const onUp = (e: PointerEvent) => {
      if (cur.current?.via !== 'drag') return
      canvas.releasePointerCapture?.(e.pointerId)
      end(true)
      e.stopImmediatePropagation()
    }
    const handlers: [string, EventListener][] = [['pointerdown', onDown as EventListener], ['pointermove', onMove as EventListener],
      ['pointerup', onUp as EventListener], ['contextmenu', onCtx as EventListener]]
    for (const [ev, fn] of handlers) host.addEventListener(ev, fn, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      for (const [ev, fn] of handlers) host.removeEventListener(ev, fn, true)
      window.removeEventListener('keydown', onKey, true)
      if (cur.current) end(false)
    }
  }, [stage]) // eslint-disable-line react-hooks/exhaustive-deps -- view and live are refs

  return shown
}
