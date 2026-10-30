// The walk's marks over the viewport (usePickOverlays mounts it): in every pane on, a dashed line from her start along the path
// and a ring on the ground at the spot, projected through that pane's camera each frame — and, while Walk to a spot is armed,
// the rubber band from her place to the spot under the mouse with a ring at it (walk-tool-hot-state). One SVG per pane, laid on
// the pane's picture and clipped to it. DOM only, as the pick tag and the Top View's lane: nothing enters the lab scene, so no
// capture sees it.
import { Vector3 } from 'three'
import type { PaneId } from '../../labs/projection/engine/panes'
import type { Stage } from '../../labs/projection/engine/Stage'
import type { Pt } from './panels/blocking/blockingMath'
import { ringAround, sampleWalk, walkHot, walkMarks, piecePaths } from './walkMarks'
import './stagePanes.css'

const SVG = 'http://www.w3.org/2000/svg'
const PANES: readonly PaneId[] = ['camera', 'free', 'top']
const r1 = (v: number) => Math.round(v * 10) / 10

interface PaneSvg {
  svg: SVGSVGElement
  path: SVGPathElement
  spot: SVGPolygonElement
  start: SVGCircleElement
  band: SVGPathElement
  bandSpot: SVGPolygonElement
  /** (prop-movement wave) the picked pieces' travel paths: same dashed line as the walk's, in the stage's cool accent */
  piece: SVGPathElement
}

function paneSvg(host: HTMLElement, pane: PaneId): PaneSvg {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('class', 'st-walk')
  svg.dataset.testid = `stage-walk-${pane}`
  const path = document.createElementNS(SVG, 'path')
  path.setAttribute('class', 'st-walk-path')
  const spot = document.createElementNS(SVG, 'polygon')
  spot.setAttribute('class', 'st-walk-spot')
  const start = document.createElementNS(SVG, 'circle')
  start.setAttribute('class', 'st-walk-start')
  start.setAttribute('r', '4')
  // the armed pick's rubber band: a finer dashed line and a ring at the spot under the mouse (styles ride inline: this CSS
  // file is another track's)
  const band = document.createElementNS(SVG, 'path')
  band.setAttribute('fill', 'none')
  band.setAttribute('stroke', '#f2b84b')
  band.setAttribute('stroke-width', '1.5')
  band.setAttribute('stroke-dasharray', '2 3')
  band.setAttribute('stroke-linecap', 'round')
  const bandSpot = document.createElementNS(SVG, 'polygon')
  bandSpot.setAttribute('fill', 'rgba(242,184,75,.15)')
  bandSpot.setAttribute('stroke', '#f2b84b')
  bandSpot.setAttribute('stroke-width', '1.5')
  // (prop-movement wave) a picked piece's travel path(s): the same dashed line, cool-toned so it reads apart from the walk's amber
  const piece = document.createElementNS(SVG, 'path')
  piece.setAttribute('fill', 'none')
  piece.setAttribute('stroke', '#7ec8e3')
  piece.setAttribute('stroke-width', '1.5')
  piece.setAttribute('stroke-dasharray', '5 4')
  piece.setAttribute('stroke-linecap', 'round')
  svg.append(path, spot, start, band, bandSpot, piece)
  host.appendChild(svg)
  return { svg, path, spot, start, band, bandSpot, piece }
}

/** Mount the walk's marks on the canvas' parent; `groundAt` reads the kit layer's ground height (0 with none). The picked pieces'
 *  travel paths (piecePaths, walkMarks.ts) draw the same way, published by the stage shell or the armed Move-to-a-spot control. */
export function mountWalkOverlay(stage: Stage, groundAt: () => (x: number, z: number) => number) {
  const canvas = stage.renderer.domElement
  const host = canvas.parentElement!
  const svgs = new Map<PaneId, PaneSvg>()
  const place = () => {
    const walk = walkMarks()
    const hot = walkHot()
    const moves = piecePaths()
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1
    const g = groundAt()
    for (const pane of PANES) {
      const rect = walk || hot || moves ? stage.panes.rect(pane, w, h) : null
      let s = svgs.get(pane)
      if (!rect) { if (s) s.svg.style.display = 'none'; continue }
      s ??= paneSvg(host, pane)
      svgs.set(pane, s)
      s.svg.style.display = ''
      s.svg.style.left = `${canvas.offsetLeft + rect.x}px`
      s.svg.style.top = `${canvas.offsetTop + rect.y}px`
      s.svg.setAttribute('width', String(rect.w))
      s.svg.setAttribute('height', String(rect.h))
      const cam = stage.panes.camera(pane)
      cam.updateMatrixWorld()
      // a ground point in this pane's px, or null behind the lens (a perspective line through it would fold back across the frame)
      const px = ([x, z]: Pt): [number, number] | null => {
        const v = new Vector3(x, g(x, z), z).project(cam)
        if (!(v.z > -1 && v.z < 1)) return null
        return [r1(((v.x + 1) / 2) * rect.w), r1(((1 - v.y) / 2) * rect.h)]
      }
      s.path.setAttribute('d', walk ? pathD(sampleWalk(walk).map(px)) : '')
      const ring = walk ? ringAround(walk[walk.length - 1]).map(px) : []
      s.spot.setAttribute('points', ring.length && ring.every(Boolean) ? ring.map((p) => p!.join(',')).join(' ') : '')
      const a = walk ? px(walk[0]) : null
      s.start.style.display = a ? '' : 'none'
      if (a) { s.start.setAttribute('cx', String(a[0])); s.start.setAttribute('cy', String(a[1])) }
      // the armed pick's band: her place to the spot under the mouse (the band alone hides when the cursor leaves the ground)
      const b0 = hot ? px(hot.from) : null
      const b1 = hot?.to ? px(hot.to) : null
      s.band.setAttribute('d', b0 && b1 ? pathD([b0, b1]) : '')
      const bring = hot?.to ? ringAround(hot.to).map(px) : []
      s.bandSpot.setAttribute('points', bring.length && bring.every(Boolean) ? bring.map((p) => p!.join(',')).join(' ') : '')
      // the picked pieces' travel paths, each its own dashed line (prop-movement wave); nothing here enters a capture
      s.piece.setAttribute('d', moves ? moves.map((m) => pathD(sampleWalk([...m]).map(px))).join(' ') : '')
    }
  }
  return {
    place,
    remove: () => { for (const s of svgs.values()) s.svg.remove(); svgs.clear() },
  }
}

/** an SVG path through the points, broken wherever a point is behind the lens (null) */
export function pathD(pts: ([number, number] | null)[]): string {
  let d = '', pen = false
  for (const p of pts) {
    if (!p) { pen = false; continue }
    d += `${pen ? 'L' : 'M'}${p[0]},${p[1]} `
    pen = true
  }
  return d.trim()
}
