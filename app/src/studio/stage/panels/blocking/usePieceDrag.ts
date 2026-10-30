// Dragging set pieces in Blocking's top view (recipe wave; E137: hand-placing the pieces was the only real work, and the owner
// wants it in the app). A press on a piece picks it; dragging moves its `at`; the turn knob, or [ and ] (Shift: 5°), turn its
// yawDeg. Each change is saved free to the world's plan (POST /__lab/stage3d/piece, a narrow move: nothing else in the plan
// changes), then the world is re-read so the 3D view shows it. Until the save answers the piece is drawn where it was dropped.
import { useCallback, useEffect, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { ScenePlan } from '../../../../stage3d/contract'
import { KIT_CHANGED, STAGE3D_ROUTE } from '../../../../labs/projection/stage3d/kitApi'
import { gateSetEdit, readOnlySet } from '../../../../labs/projection/stage3d/setEditGate'
import { plainRefusal } from '../../../scene/setPlaceApi'
import { groundPointAt, type Box, type Pt } from './blockingMath'

export type MovePiece = (world: string, index: number, kind: string, at: Pt, yawDeg: number) => Promise<void>
export type LabelPiece = (world: string, index: number, kind: string, label: string) => Promise<void>
export type SwapPiece = (world: string, index: number, kind: string, swapTo: string) => Promise<void>

async function postPiece(world: string, body: unknown): Promise<void> {
  gateSetEdit(world) // a take on show with its own other set: refused, nothing sent (setEditGate.ts)
  const res = await fetch(`${STAGE3D_ROUTE}/piece?id=${encodeURIComponent(world)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  // the server's own refusal names pieces by list position and carries coordinates: said in plain words (setPlaceApi plainRefusal)
  if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string; errors?: string[] }; throw new Error(plainRefusal(b.error, b.errors, res.status)) }
  window.dispatchEvent(new CustomEvent(KIT_CHANGED, { detail: { id: world } }))
}

/** a drag's drop: the piece's place and facing, nothing else in the plan changes */
export const movePiece: MovePiece = (world, index, kind, at, yawDeg) => postPiece(world, { index, kind, at, yawDeg })

/** the piece's own words (its label), saved as-is ('' clears them); nothing else in the plan changes */
export const labelPiece: LabelPiece = (world, index, kind, label) => postPiece(world, { index, kind, label })

/** a library piece's kind swap: its place, turn, size and words are kept (a built piece keeps its own kind: the server refuses) */
export const swapPiece: SwapPiece = (world, index, kind, swapTo) => postPiece(world, { index, kind, swapTo })

/** a client point -> the ground point under it, through the svg's own viewBox and letterbox (blockingMath.groundPointAt) */
export function toGround(svg: SVGSVGElement | null, clientX: number, clientY: number): Pt | null {
  const vb = svg?.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
  if (!svg || !vb || vb.length !== 4 || vb.some((v) => !Number.isFinite(v))) return null
  const r = svg.getBoundingClientRect(), box: Box = [vb[0], vb[1], vb[0] + vb[2], vb[1] + vb[3]]
  return groundPointAt(box, r.width, r.height, clientX - r.left, clientY - r.top)
}

/** the turn (deg, 0 = facing +z) that faces from `at` toward `p`, in 5° steps */
export const yawToward = (at: Pt, p: Pt) => Math.round((Math.atan2(p[0] - at[0], p[1] - at[1]) * 180) / Math.PI / 5) * 5
const norm = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180

interface Drag { index: number; mode: 'move' | 'turn'; at: Pt; yaw: number; moved: boolean }
/** (set viewport) poses another view is drawing (by piece index), and who is told of a drag here as it moves */
export interface SharedPoses { live?: Readonly<Record<string, { at: Pt; yaw: number }>>; onDrag?: (index: number, pose: { at: Pt; yaw: number }) => void }

export function usePieceDrag(plan: ScenePlan, world: string | null, save: MovePiece = movePiece, shared: SharedPoses = {}) {
  const [drag, setDrag] = useState<Drag | null>(null)
  /** what was dropped and is being saved: drawn there until the re-read plan shows it */
  const [held, setHeld] = useState<Record<number, { at: Pt; yaw: number }>>({})
  const [sel, setSel] = useState<number | null>(null)
  /** the last refused move, drawn beside the piece it was */
  const [error, setError] = useState<{ index: number; text: string } | null>(null)

  useEffect(() => { setHeld({}) }, [plan])

  const poseOf = (i: number) => {
    if (drag?.index === i) return { at: drag.at, yaw: drag.yaw }
    const h = shared.live?.[String(i)] ?? held[i], it = plan.kit[i]
    return h ?? { at: it.at as Pt, yaw: it.yawDeg ?? 0 }
  }

  const commit = useCallback((index: number, at: Pt, yaw: number) => {
    const it = plan.kit[index]
    if (!world || !it) return
    setHeld((h) => ({ ...h, [index]: { at, yaw } }))
    setError(null)
    // a refused move snaps back at once; a saved one is held until the re-read plan (a new `plan`) shows it
    save(world, index, it.kind, at, yaw).catch((e: unknown) => {
      setError({ index, text: `${it.kind} was not moved: ${e instanceof Error ? e.message : String(e)}` })
      setHeld((h) => { const n = { ...h }; delete n[index]; return n })
    })
  }, [plan, world, save])

  const down = (index: number, mode: Drag['mode']) => (e: PointerEvent<SVGElement>) => {
    e.stopPropagation()
    if (!world || readOnlySet(world)) return // the take on show's own set: nothing to drag
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    const p = poseOf(index)
    setSel(index)
    setDrag({ index, mode, at: p.at, yaw: p.yaw, moved: false })
  }
  const move = (e: PointerEvent<SVGElement>) => {
    if (!drag) return
    e.stopPropagation()
    const p = toGround((e.currentTarget as SVGElement).ownerSVGElement, e.clientX, e.clientY)
    if (!p) return
    const next = drag.mode === 'move' ? { ...drag, at: p, moved: true } : { ...drag, yaw: yawToward(drag.at, p), moved: true }
    setDrag(next)
    shared.onDrag?.(next.index, { at: next.at, yaw: next.yaw })
  }
  const up = (e: PointerEvent<SVGElement>) => {
    if (!drag) return
    e.stopPropagation()
    ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
    if (drag.moved) commit(drag.index, drag.at, drag.yaw)
    setDrag(null)
  }
  const key = (index: number) => (e: KeyboardEvent<SVGElement>) => {
    const step = e.key === '[' ? -1 : e.key === ']' ? 1 : 0
    if (!step) return
    e.preventDefault(); e.stopPropagation()
    const p = poseOf(index)
    commit(index, p.at, norm(p.yaw + step * (e.shiftKey ? 5 : 15)))
  }
  return { poseOf, sel, setSel, drag, error, down, move, up, key, held: Object.keys(held).length > 0 }
}
