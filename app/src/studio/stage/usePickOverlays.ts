// The pick's DOM overlays over the stage canvas (split out of useStagePick, layout wave L3, so the pointer pipeline and the mark
// stay under ~300 lines): the picked thing's floating name (projected per pane each frame) and the Top View's SVG layer (the
// walking lane and every labelled piece). DOM only: nothing here enters the lab scene, so no capture sees any of it.
import { useEffect, useRef, type RefObject } from 'react'
import { Vector3 } from 'three'
import type { Stage } from '../../labs/projection/engine/Stage'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { clipLabel, labelled } from '../scene/SetPlace'
import type { SetPlaceState } from '../scene/useSetPlace'
import type { KitPick } from '../../labs/projection/stage3d/kitPick'
import { mountWalkOverlay } from './walkOverlay'
import { setSavedPiecePaths } from './walkMarks'
import { stageMemo } from './stageMemory'

const r1 = (v: number) => Math.round(v * 10) / 10

/**
 * Mount the overlays on the canvas' parent while `stage` lives: the floating pick tag (via `placeLabel.current`, which the pick
 * state also calls when the selection changes) and the Top View SVG, both reprojected every frame. `live` reads the latest lab
 * and composing state without re-running the effect; `view` is the current KitPick (null between layers).
 */
export function usePickOverlays(stage: Stage | null | undefined,
  live: RefObject<{ lab: ProjectionLabState; p: SetPlaceState; hint?: string | null }>,
  view: RefObject<KitPick | null>,
  placeLabel: RefObject<() => void>) {
  const started = useRef(false)
  useEffect(() => {
    if (!stage || started.current) return
    const canvas = stage.renderer.domElement
    const host = canvas.parentElement
    if (!host) return
    started.current = true
    const tag = document.createElement('div')
    tag.className = 'st-pick-tag'
    tag.style.display = 'none'
    tag.dataset.testid = 'stage-pick-tag'
    host.appendChild(tag)
    // the tools' keys, a small pill under the name (only while a Free or Top pane is on: the keys work there)
    const hint = document.createElement('div')
    hint.className = 'st-pick-tag st-tool-hint'
    hint.style.display = 'none'
    hint.dataset.testid = 'stage-tool-hint'
    host.appendChild(hint)
    const labelText = () => {
      const { p } = live.current!
      if (p.pick === null) return null
      if (p.pick === 'mark') return 'the person'
      const it = p.item
      return it ? (it.label || it.kind) : null // a built piece's kind is its stand-in ("crates"): its name alone
    }
    // the pick's name rides the picked thing in the first pane that shows it (the Camera first, as before panes)
    placeLabel.current = () => {
      const text = labelText()
      const at = view.current && text ? view.current.labelPoint() : null
      tag.textContent = text ?? ''
      const keys = stage.panes.active.some((p) => p !== 'camera') ? live.current!.hint ?? null : null
      hint.textContent = keys ?? ''
      hint.style.display = 'none'
      if (!at) { tag.style.display = 'none'; return }
      for (const pane of stage.panes.active) {
        const pt = stage.panes.project(pane, at)
        if (!pt.inside) continue
        tag.style.display = ''
        tag.style.left = `${canvas.offsetLeft + pt.x}px`
        tag.style.top = `${canvas.offsetTop + pt.y}px`
        if (keys) { hint.style.display = ''; hint.style.left = tag.style.left; hint.style.top = `${canvas.offsetTop + pt.y + 22}px` }
        return
      }
      tag.style.display = 'none'
    }
    // the Top View's overlay: the walking lane and every labelled piece (the Set's top view's rule), projected through
    // the top pane's camera. A DOM layer over the canvas — nothing enters the scene, so a capture never sees it.
    const svgNS = 'http://www.w3.org/2000/svg'
    const top = document.createElementNS(svgNS, 'svg')
    top.setAttribute('class', 'st-top')
    top.dataset.testid = 'stage-top'
    top.style.display = 'none'
    const lane = document.createElementNS(svgNS, 'polyline')
    lane.setAttribute('class', 'st-top-lane')
    top.appendChild(lane)
    // the camera's start on the plan (camera-start-point): a small marker at its ground place, amber like the pick
    const startMark = document.createElementNS(svgNS, 'circle')
    startMark.setAttribute('r', '4')
    startMark.setAttribute('fill', '#f2b84b')
    startMark.setAttribute('stroke', '#000')
    startMark.setAttribute('stroke-width', '1')
    startMark.dataset.testid = 'stage-top-start'
    top.appendChild(startMark)
    host.appendChild(top)
    const topLabels = new Map<number, SVGTextElement>()
    const placeTop = () => {
      const kit = live.current!.lab.kit
      const rect = stage.panes.active.includes('top') && kit.world
        ? stage.panes.rect('top', canvas.clientWidth || 1, canvas.clientHeight || 1)
        : null
      if (!rect) { top.style.display = 'none'; return }
      top.style.display = ''
      top.style.left = `${canvas.offsetLeft + rect.x}px`
      top.style.top = `${canvas.offsetTop + rect.y}px`
      top.setAttribute('width', String(rect.w))
      top.setAttribute('height', String(rect.h))
      top.setAttribute('viewBox', `0 0 ${rect.w} ${rect.h}`)
      const groundAt = kit.layer?.groundAt ?? (() => 0)
      const toPx = (x: number, z: number) => {
        const s = stage.panes.project('top', new Vector3(x, groundAt(x, z), z))
        return `${r1(s.x - rect.x)},${r1(s.y - rect.y)}`
      }
      const path = kit.perf?.path ?? []
      lane.setAttribute('points', path.map(([x, z]) => toPx(x, z)).join(' '))
      const start = stageMemo().start
      if (start) {
        const [sx, sy] = toPx(start.position[0], start.position[2]).split(',').map(Number)
        startMark.setAttribute('cx', String(r1(sx)))
        startMark.setAttribute('cy', String(r1(sy)))
        startMark.style.display = ''
      } else startMark.style.display = 'none'
      const plan = kit.world!.plan
      const want = new Set(labelled(plan.kit, live.current!.p.sel))
      for (const [i, el] of topLabels) {
        if (!want.has(i)) { el.remove(); topLabels.delete(i) }
      }
      for (const i of want) {
        let el = topLabels.get(i)
        if (!el) {
          el = document.createElementNS(svgNS, 'text')
          el.setAttribute('class', 'st-top-label')
          el.setAttribute('data-testid', `stage-top-label-${i}`)
          el.textContent = clipLabel(plan.kit[i].label!)
          top.appendChild(el)
          topLabels.set(i, el)
        }
        const at = live.current!.p.poses[String(i)]?.at ?? plan.kit[i].at
        const [px, py] = toPx(at[0], at[1]).split(',').map(Number)
        el.setAttribute('x', String(r1(px + 6)))
        el.setAttribute('y', String(r1(py - 5)))
      }
    }
    // the walk to a spot (WalkTo publishes it while the person is picked): its line and the spot's ring, in every pane — and the
    // picked pieces' travel paths (prop-movement wave), published from the layer's plan each frame so a saved path shows before any
    // render; the walk overlay draws both
    const walk = mountWalkOverlay(stage, () => live.current!.lab.kit.layer?.groundAt ?? (() => 0))
    placeLabel.current()
    let frame = 0
    const loop = () => {
      frame = requestAnimationFrame(loop)
      const kit = live.current!.lab.kit
      setSavedPiecePaths(kit.layer ? kit.layer.plan.kit.filter((it) => it.move !== undefined).map((it) => it.move!.path) : null)
      view.current?.placeGizmo(); placeLabel.current(); placeTop(); walk.place()
    }
    if (typeof requestAnimationFrame !== 'undefined') loop()
    return () => {
      started.current = false
      if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(frame)
      placeLabel.current = () => {}
      tag.remove()
      hint.remove()
      top.remove()
      walk.remove()
      setSavedPiecePaths(null)
      topLabels.clear()
    }
  }, [stage]) // eslint-disable-line react-hooks/exhaustive-deps -- live/view/placeLabel are refs, stable for the effect's life
}
