// Front faces (front-faces, owner 2026-10-29): a mesh built from one picture can have its front on any axis, so a car travelling
// "facing the way it goes" drove sideways or backwards. This says where its front is, as the mesh's own turn offset
// (GlbPiece.yawOffsetDeg — the engine's one offset, not a second): Turn the front 90° left / right, Flip it 180°, and small
// squaring nudges. Each press saves through the Set's own piece route and the viewport turns the model at once; with a saved move
// the stage shows it facing its first stretch of path, so the nose can be lined up with the path. A guess from the mesh's long
// axis is offered as a suggestion, never applied by itself. Free.
import { Box3, Matrix4, Mesh, type Object3D } from 'three'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { KIT_INDEX } from '../../../stage3d/world'
import type { SetPlaceState } from '../../scene/useSetPlace'

/** TRELLIS builds come in with this offset (server/pieces/place.ts TRELLIS_YAW_OFFSET): "as built" */
export const BUILT_FRONT = 90
const norm = (d: number) => ((Math.round(d * 10) / 10 % 360) + 360) % 360

/** the front in words, relative to the mesh as built */
export function frontWords(offset: number | undefined): string {
  const rel = norm((offset ?? BUILT_FRONT) - BUILT_FRONT)
  if (rel === 0) return 'as built'
  if (rel === 90) return 'turned 90° left'
  if (rel === 180) return 'flipped 180°'
  if (rel === 270) return 'turned 90° right'
  return `turned ${rel > 180 ? `${Math.round((360 - rel) * 10) / 10}° right` : `${rel}° left`}`
}

/** the mesh's long axis read from its own frame: 'built' when it runs along the built front (local x), 'across' otherwise; null
 *  when the mesh is not on the stage or is about square (no guess) */
export function longAxisGuess(root: Object3D | null): 'built' | 'across' | null {
  if (!root) return null
  root.updateMatrixWorld(true)
  const inv = new Matrix4().copy(root.matrixWorld).invert()
  const box = new Box3()
  root.traverse((o) => {
    if (!(o instanceof Mesh) || !o.visible || !o.geometry) return
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
    box.union(o.geometry.boundingBox!.clone().applyMatrix4(new Matrix4().multiplyMatrices(inv, o.matrixWorld)))
  })
  if (box.isEmpty()) return null
  const x = box.max.x - box.min.x, z = box.max.z - box.min.z
  if (Math.max(x, z) < 1.25 * Math.min(x, z)) return null
  return x > z ? 'built' : 'across'
}

const rootOf = (lab: ProjectionLabState | undefined, index: number | null): Object3D | null => {
  if (!lab?.kit.layer || index === null) return null
  let hit: Object3D | null = null
  lab.kit.layer.group.traverse((o) => { if (!hit && o.userData[KIT_INDEX] === index) hit = o })
  return hit
}

/** `compact`: the piece panel's row (the four fast presses and the one line); the card's Advanced tab has the whole control */
export function PropFront({ place, lab, compact }: { place: SetPlaceState; lab?: ProjectionLabState; compact?: boolean }) {
  const item = place.item
  if (!item) return null
  if (!item.glb && compact) return null
  if (!item.glb) {
    return (
      <div className="oc-field" data-testid="prop-front">
        <label>Front faces</label>
        <span className="st-field-hint" data-testid="prop-front-none">Build it in 3D first: then say where its front is, so it travels nose first.</span>
      </div>
    )
  }
  const offset = item.glb.yawOffsetDeg ?? BUILT_FRONT
  const turn = (d: number) => void place.setFront(norm(offset + d))
  const guess = compact ? null : longAxisGuess(rootOf(lab, place.sel))
  // as built the front is along the mesh's local x; a long side running across says its front is probably a quarter turn off
  const rel = norm(offset - BUILT_FRONT)
  const suggest = guess === 'across' && rel % 180 === 0 ? 'Its long side runs across its front: it may need a quarter turn (90° left or right).'
    : guess === 'built' && rel % 180 !== 0 ? 'Its long side runs across its front now: as built (or flipped) may be right.' : null
  return (
    <div className="oc-field" data-testid="prop-front">
      <label>Front faces</label>
      <div className="sd-act">
        <button type="button" className="st-btn" data-testid="prop-front-left" onClick={() => turn(90)}>Turn front 90° left</button>
        <button type="button" className="st-btn" data-testid="prop-front-right" onClick={() => turn(-90)}>Turn front 90° right</button>
        <button type="button" className="st-btn" data-testid="prop-front-flip" onClick={() => turn(180)}>Flip 180°</button>
        {!compact && <button type="button" className="st-btn" data-testid="prop-front-square-l" title="Square it up a little" onClick={() => turn(5)}>5° left</button>}
        {!compact && <button type="button" className="st-btn" data-testid="prop-front-square-r" title="Square it up a little" onClick={() => turn(-5)}>5° right</button>}
        <button type="button" className="st-btn" data-testid="prop-front-reset" disabled={rel === 0} onClick={() => void place.setFront(BUILT_FRONT)}>As built</button>
      </div>
      <span className="st-field-hint" data-testid="prop-front-now">Its front: {frontWords(offset)}.{compact ? '' : ' When it travels facing the way it goes, the front leads.'}
        {item.move && !compact ? ' The stage shows it on its first stretch of path: turn the front until the nose points along the path.' : ''}</span>
      {suggest && <span className="st-field-hint" data-testid="prop-front-guess">{suggest}</span>}
    </div>
  )
}
