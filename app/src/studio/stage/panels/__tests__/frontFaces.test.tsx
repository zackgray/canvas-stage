// @vitest-environment jsdom
// Front faces (owner 2026-10-29: the car drove sideways or backwards). A built mesh's front is its own turn offset
// (GlbPiece.yawOffsetDeg); travelling with faceTravel on, the heading plus that offset turns it, and its resting turn is no longer
// added (that is what sent the car sideways once it had been turned to look right at rest). For a nose on any of the four sides of
// the mesh as built, the matching Front faces setting leaves the nose pointing along the travel; the live layer, the built world
// and the captures share one turn rule. The card's control saves the offset through the piece route, says it in words, and
// offers a long-axis guess without applying it.
import { fireEvent, render, screen } from '@testing-library/react'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { editKit } from '../../../../../server/stage3d/pieceEdit'
import type { KitItem, ScenePlan } from '../../../../stage3d/contract'
import { movePoseAt, pieceTurnDeg } from '../../../../stage3d/propMove'
import { KIT_INDEX } from '../../../../stage3d/world'
import type { ProjectionLabState } from '../../../../labs/projection/useProjectionLab'
import type { SetPlaceState } from '../../../scene/useSetPlace'
import { BUILT_FRONT, frontWords, longAxisGuess, PropFront } from '../PropFront'
import { ObjectCard } from '../ObjectCard'
import { PiecePanel } from '../PiecePanel'

afterEach(cleanup)
const UP = new Vector3(0, 1, 0)
const DEG = Math.PI / 180
/** a built car whose nose is k quarter turns (to the left) round from where TRELLIS puts it (local -x), set to Front faces k */
const car = (k: number, yawDeg: number): KitItem => ({
  kind: 'car', at: [0, 0], yawDeg, label: 'Car', pieceTag: 'prop:car',
  glb: { url: '/m.glb', yawOffsetDeg: BUILT_FRONT - k * 90, unitScale: 4 },
  move: { path: [[0, 0], [10, 0]], speed: 2 }, // along +x
})
const noseOf = (k: number) => new Vector3(-1, 0, 0).applyAxisAngle(UP, k * 90 * DEG)

describe('travel leads with the front', () => {
  it.each([0, 1, 2, 3])('a nose %i quarter turns round, with its Front faces set: the nose points along +x travel, whatever its resting turn', (k) => {
    for (const rest of [0, 90, -37]) {
      const it = car(k, rest)
      const turn = pieceTurnDeg(it, movePoseAt(it, 1))
      const nose = noseOf(k).applyAxisAngle(UP, turn * DEG)
      expect(nose.x).toBeCloseTo(1, 5)
      expect(nose.z).toBeCloseTo(0, 5)
    }
  })

  it('standing still, or travelling with its own facing kept, the resting turn applies as before', () => {
    const it = car(0, 30)
    expect(pieceTurnDeg(it, null)).toBe(30 + BUILT_FRONT)
    const kept = { ...it, move: { ...it.move!, faceTravel: false } }
    expect(pieceTurnDeg(kept, movePoseAt(kept, 1))).toBe(30 + BUILT_FRONT)
  })
})

describe('the piece route keeps the front on the mesh', () => {
  const plan = { seed: 1, sky: { url: '/s' }, kit: [car(0, 0), { kind: 'rock', at: [3, 3] }], mark: { at: [0, 0], yawDeg: 0 } } as unknown as ScenePlan
  it('frontDeg writes glb.yawOffsetDeg (0..360); a piece not built in 3D refuses in words', () => {
    expect(editKit(plan, { index: 0, kind: 'car', frontDeg: -90 })[0].glb).toMatchObject({ yawOffsetDeg: 270, url: '/m.glb', unitScale: 4 })
    expect(() => editKit(plan, { index: 1, kind: 'rock', frontDeg: 90 })).toThrow(/only a piece built in 3D has a front/)
  })
})

describe("the card's Front faces", () => {
  const placeOf = (it: KitItem) => ({ item: it, sel: 0, setFront: vi.fn(() => Promise.resolve()) }) as unknown as SetPlaceState & { setFront: ReturnType<typeof vi.fn> }
  it('turns, flips and squares the offset in place, and says it in words', () => {
    const place = placeOf(car(0, 0))
    render(<PropFront place={place} />)
    expect(screen.getByTestId('prop-front-now').textContent).toMatch(/Its front: as built/)
    fireEvent.click(screen.getByTestId('prop-front-left')); expect(place.setFront).toHaveBeenLastCalledWith(180)
    fireEvent.click(screen.getByTestId('prop-front-right')); expect(place.setFront).toHaveBeenLastCalledWith(0)
    fireEvent.click(screen.getByTestId('prop-front-flip')); expect(place.setFront).toHaveBeenLastCalledWith(270)
    fireEvent.click(screen.getByTestId('prop-front-square-r')); expect(place.setFront).toHaveBeenLastCalledWith(85)
    expect(frontWords(BUILT_FRONT + 180)).toBe('flipped 180°')
    expect(frontWords(BUILT_FRONT - 90)).toBe('turned 90° right')
  })

  it('a piece not built in 3D says to build it first', () => {
    render(<PropFront place={placeOf({ kind: 'crates', at: [0, 0] })} />)
    expect(screen.getByTestId('prop-front-none').textContent).toMatch(/Build it in 3D first/)
  })

  it("a mesh whose long side runs across its front gets a suggestion, never a change", () => {
    const root = new Group(); root.userData[KIT_INDEX] = 0
    root.add(new Mesh(new BoxGeometry(1, 1, 4), new MeshBasicMaterial())) // long along local z: across the built front (x)
    const layer = new Group(); layer.add(root)
    const lab = { kit: { layer: { group: layer } } } as unknown as ProjectionLabState
    expect(longAxisGuess(root)).toBe('across')
    const place = placeOf(car(0, 0))
    render(<PropFront place={place} lab={lab} />)
    expect(screen.getByTestId('prop-front-guess').textContent).toMatch(/quarter turn/)
    expect(place.setFront).not.toHaveBeenCalled()
  })
})

describe('the piece panel (owner: the controls were only in the card)', () => {
  const placeOf = (it: KitItem) => ({ item: it, sel: 0, poseOf: () => null, error: null, setFront: vi.fn(() => Promise.resolve()) }) as unknown as SetPlaceState & { setFront: ReturnType<typeof vi.fn> }
  it('a selected built prop has the Front faces row (four fast presses and its line); Its card and Advanced… open the card', () => {
    const place = placeOf({ ...car(0, -4), glb: { url: '/m.glb', yawOffsetDeg: BUILT_FRONT + 90 } })
    const open = vi.fn(), adv = vi.fn()
    render(<PiecePanel place={place} onOpenCard={open} onOpenAdvanced={adv} />)
    expect(screen.getByTestId('prop-front-now').textContent).toBe('Its front: turned 90° left.')
    expect(screen.queryByTestId('prop-front-square-l')).toBeNull() // the small nudges stay in the card
    fireEvent.click(screen.getByTestId('prop-front-flip')); expect(place.setFront).toHaveBeenLastCalledWith(0)
    fireEvent.click(screen.getByTestId('prop-front-reset')); expect(place.setFront).toHaveBeenLastCalledWith(BUILT_FRONT)
    expect(screen.getByTestId('piece-open-card').textContent).toBe('Its card')
    fireEvent.click(screen.getByTestId('piece-open-advanced')); expect(adv).toHaveBeenCalled()
  })

  it('a stand-in not built in 3D has no Front faces row', () => {
    render(<PiecePanel place={placeOf({ kind: 'crates', at: [0, 0], pieceTag: 'prop:cart' })} />)
    expect(screen.queryByTestId('prop-front')).toBeNull()
  })

  it('the card opens straight on its Advanced tab when asked', () => {
    render(<ObjectCard kind="prop" name="Car" look={<p>the look</p>} advanced={<p>the advanced</p>} startTab="advanced" onClose={() => {}} />)
    expect(screen.getByText('the advanced')).toBeTruthy()
    expect(screen.getByTestId('object-tab-advanced').getAttribute('aria-selected')).toBe('true')
  })
})
