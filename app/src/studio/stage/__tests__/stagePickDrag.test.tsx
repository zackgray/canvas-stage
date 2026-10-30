// @vitest-environment jsdom
// The Stage's pick and drag on the lab viewport (merge steps 4–5), through useStagePick with the fake-renderer pattern the Set's
// own panes test with (stage/__tests__/liveFakes.tsx): a real kit world on a fake canvas (no WebGL; raycasting runs in jsdom)
// and a real Panes (engine/panes.ts), so a press casts through whichever pane it lands in. Clicking boxes+names a piece,
// dragging moves it live and saves once on drop (movePiece / setPlaceApi.mark), a drag begun in the Top View lands exactly
// where it would in the Camera, a horizon-crossing pointer holds the piece, an armed operator gesture keeps the press, and
// a ground click fires only when nothing was hit; a right-click on empty ground in the Free view opens Add here, one on a piece
// opens Add here, one on a piece opens its menu (Move to a spot / Edit look / Duplicate / Remove; a plain piece swaps), one on
// the person opens theirs (Walk to a spot / Slow walk / Run / Hold here / Edit look), and any left-click or Esc closes a menu.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Box3, PerspectiveCamera, Vector3 } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Panes } from '../../../labs/projection/engine/panes'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { buildWorld } from '../../../stage3d/world'
import { KitLayer } from '../../../labs/projection/stage3d/KitLayer'
import type { PlaceApi } from '../../scene/setPlaceApi'
import { useStagePick } from '../useStagePick'
import { ArrangeTip } from '../ArrangeTip'
import { setGroundDrawing } from '../groundDrawing'
import { CH, CW, ID, plan, world0 } from './liveFakes'
import { api, clickAt, CRATES, disposeRig, dragBy, groundPt, Host, isBoxed, letGo, menuOf, moveTo, pickOf, piece, layers, press, Probe, screenOf, stageLab, type Pt } from './stagePickRig'

afterEach(() => { cleanup(); disposeRig() })

describe('useStagePick on the lab viewport', () => {
  it('clicking a piece picks it: the box and the name show, nothing is saved', () => {
    const { lab, canvas, layer } = stageLab()
    const a = api()
    render(<Host lab={lab} api={a} />)
    clickAt(canvas, screenOf(lab.stage!.view, CRATES.clone().add(new Vector3(0, 0.4, 0))))
    const tag = screen.getByTestId('stage-pick-tag')
    expect(tag.textContent).toBe('white-painted hive')
    expect(tag.style.display).not.toBe('none')
    expect(isBoxed(layer)).toBe(true)
    expect(a.move).not.toHaveBeenCalled()
    expect(a.mark).not.toHaveBeenCalled()
  })

  it('dragging a piece moves it live and saves once on drop, at the dropped place', () => {
    const { lab, canvas, view, layer } = stageLab()
    const a = api()
    render(<Host lab={lab} api={a} />)
    const to = dragBy(view, layer, canvas, piece(layer, 0), CRATES.clone().add(new Vector3(0, 0.4, 0)), 1.5, -1)
    const pos = piece(layer, 0).position
    expect(pos.x).toBeCloseTo(4.5, 1)
    expect(pos.z).toBeCloseTo(-10, 1)
    expect(a.move).not.toHaveBeenCalled() // the drop, not the drag, saves
    letGo(canvas, to)
    expect(a.move).toHaveBeenCalledTimes(1)
    expect(a.move).toHaveBeenCalledWith(ID, 0, 'crates', [4.5, -10], 0)
  })

  it('dragging the mark saves it through the mark route', () => {
    const { lab, canvas, view, layer } = stageLab()
    const a = api()
    render(<Host lab={lab} api={a} />)
    const mark = layer.group.children.find((c) => c.name === 'mark-figure')!
    const at = mark.position.clone().add(new Vector3(0, 1.2, 0))
    const to = dragBy(view, layer, canvas, mark, at, 0, 1)
    expect(mark.position.z).toBeCloseTo(-11.5, 1)
    letGo(canvas, to)
    expect(a.mark).toHaveBeenCalledTimes(1)
    expect(a.mark).toHaveBeenCalledWith(ID, [0.6, -11.5], 0)
    expect(a.move).not.toHaveBeenCalled()
  })

  it('a pointer dragged past the horizon holds the piece where it last was', () => {
    const { lab, canvas, view, layer } = stageLab()
    const a = api()
    render(<Host lab={lab} api={a} />)
    // the eye under the tree's crown: down at the ground the ray never meets the crown's level
    view.position.set(-6 + 9, 1.2, -16 + 9)
    view.lookAt(-6, 1.5, -16)
    view.updateMatrixWorld()
    const tree = piece(layer, 1)
    const box = new Box3().setFromObject(tree)
    const crown = new Vector3((box.min.x + box.max.x) / 2, box.min.y + (box.max.y - box.min.y) * 0.65, (box.min.z + box.max.z) / 2)
    const to = dragBy(view, layer, canvas, tree, crown, 0.5, 0)
    expect(Math.hypot(tree.position.x + 6, tree.position.z + 16)).toBeGreaterThan(0.3) // it did move
    moveTo(canvas, { clientX: CW / 2, clientY: CH - 1 }) // down at the ground: never up at the crown's height
    expect(Math.hypot(tree.position.x + 6, tree.position.z + 16)).toBeCloseTo(0.5, 1) // held, no runaway
    letGo(canvas, to)
    expect(a.move).toHaveBeenCalledTimes(1)
  })

  it('a click on empty ground lets go of the pick', () => {
    const { lab, canvas, layer } = stageLab()
    const a = api()
    render(<Host lab={lab} api={a} />)
    clickAt(canvas, screenOf(lab.stage!.view, CRATES.clone().add(new Vector3(0, 0.4, 0))))
    expect(screen.getByTestId('stage-pick-tag').textContent).toBe('white-painted hive')
    const ground = new Vector3(1, layer.groundAt(1, 6), 6)
    clickAt(canvas, screenOf(lab.stage!.view, ground))
    expect(screen.getByTestId('stage-pick-tag').style.display).toBe('none')
    expect(isBoxed(layer)).toBe(false)
  })

  it('defers to an armed operator gesture: the press picks nothing', () => {
    const { lab, canvas } = stageLab('operator')
    const a = api()
    render(<Host lab={lab} api={a} />)
    press(canvas, screenOf(lab.stage!.view, CRATES.clone().add(new Vector3(0, 0.4, 0))))
    moveTo(canvas, { clientX: CW / 2, clientY: CH / 2 })
    letGo(canvas, { clientX: CW / 2, clientY: CH / 2 })
    expect(screen.getByTestId('stage-pick-tag').textContent).toBe('')
    expect(a.move).not.toHaveBeenCalled()
  })

  it("a ground click fires only when nothing was hit; while a path draw is on, the miss's click is the draw's", () => {
    const { lab, canvas } = stageLab()
    const a = api()
    render(<Host lab={lab} api={a} />)
    const groundClicks: Event[] = []
    canvas.addEventListener('click', (e) => groundClicks.push(e)) // what focusOnClick (useGroundClick) listens with
    clickAt(canvas, screenOf(lab.stage!.view, CRATES.clone().add(new Vector3(0, 0.4, 0))))
    expect(groundClicks.length).toBe(0) // the hit's click never reached the canvas
    clickAt(canvas, screenOf(lab.stage!.view, new Vector3(1, 0, 6)))
    expect(groundClicks.length).toBe(1) // a miss reaches the canvas' own click
    // while Blocking draws (its view's flag), the miss's click is a path point's again
    setGroundDrawing(true)
    try {
      clickAt(canvas, screenOf(lab.stage!.view, new Vector3(1, 0, 6)))
      expect(groundClicks.length).toBe(2)
    } finally { setGroundDrawing(false) }
  })

  it('a KIT_CHANGED rebuild re-selects the still-picked piece by index on the new layer', () => {
    const { lab, canvas } = stageLab()
    const a = api()
    const first = render(<Host lab={lab} api={a} />)
    clickAt(canvas, screenOf(lab.stage!.view, CRATES.clone().add(new Vector3(0, 0.4, 0))))
    expect(screen.getByTestId('stage-pick-tag').textContent).toBe('white-painted hive')
    const layer2 = new KitLayer(buildWorld(plan), ID, plan, world0.perf) // what useKit builds on the KIT_CHANGED re-read
    layers.push(layer2)
    first.rerender(<Host lab={{ ...lab, kit: { ...lab.kit, layer: layer2 } } as ProjectionLabState} api={a} />)
    expect(isBoxed(layer2)).toBe(true)
    expect(screen.getByTestId('stage-pick-tag').textContent).toBe('white-painted hive')
  })

  it('a drag begun in the Top View lands exactly where it would in the Camera, and saves once', () => {
    const { lab, canvas, layer, panes } = stageLab()
    panes.set(['camera', 'top']) // the canvas splits; the top view is the right half
    const a = api()
    render(<Host lab={lab} api={a} />)
    const rect = panes.rect('top', CW, CH)!
    const topPt = (p: Vector3) => {
      const c = p.clone().project(panes.top)
      return { clientX: rect.x + ((c.x + 1) / 2) * rect.w, clientY: rect.y + ((1 - c.y) / 2) * rect.h }
    }
    const at = CRATES.clone().add(new Vector3(0, 0.4, 0))
    const from = topPt(at)
    // the press really is the top pane's: its ray meets the crates
    expect(panes.rayAt(from.clientX, from.clientY).intersectObject(piece(layer, 0), true)[0]).toBeTruthy()
    const H = layer.groundAt
    const to = topPt(at.clone().add(new Vector3(1.5, H(4.5, -10) - H(3, -9), -1)))
    press(canvas, from)
    moveTo(canvas, to)
    const pos = piece(layer, 0).position
    expect(pos.x).toBeCloseTo(4.5, 1) // the drag draws live in the one scene every pane shows
    expect(pos.z).toBeCloseTo(-10, 1)
    letGo(canvas, to)
    expect(a.move).toHaveBeenCalledTimes(1) // one save, at the dropped place
    expect(a.move).toHaveBeenCalledWith(ID, 0, 'crates', [4.5, -10], 0)
    expect(isBoxed(layer)).toBe(true)
    expect(screen.getByTestId('stage-pick-tag').textContent).toBe('white-painted hive')
  })
})

describe('free orbit beside the pick handler (L1.2)', () => {
  /** a press in the free pane, on ground no kit root resolves to: the orbit's, never the pick's */
  function freeGroundPt(panes: Panes) {
    const rect = panes.rect('free', CW, CH)!
    panes.free.updateMatrixWorld()
    const centre = panes.rayAt(rect.x + rect.w / 2, rect.y + rect.h / 2).ray
    const t = -centre.origin.y / centre.direction.y
    const gp = centre.origin.clone().addScaledVector(centre.direction, t).add(new Vector3(2, 0, 0))
    const c = gp.clone().project(panes.free)
    return { clientX: rect.x + ((c.x + 1) / 2) * rect.w, clientY: rect.y + ((1 - c.y) / 2) * rect.h }
  }

  it('a drag on empty ground over the free pane orbits the free camera and neither picks nor saves', () => {
    const { lab, canvas, layer, panes } = stageLab()
    panes.set(['camera', 'free'])
    const a = api()
    render(<Host lab={lab} api={a} />)
    const at = freeGroundPt(panes)
    const q0 = panes.free.quaternion.clone()
    press(canvas, at)
    moveTo(canvas, { clientX: at.clientX + 40, clientY: at.clientY + 10 })
    letGo(canvas, { clientX: at.clientX + 40, clientY: at.clientY + 10 })
    expect(panes.free.quaternion.angleTo(q0)).toBeGreaterThan(0.0001) // the drag reached the orbit controls
    expect(a.move).not.toHaveBeenCalled() // nothing was dragged, nothing saved
    expect(isBoxed(layer)).toBe(false) // nothing was picked
  })

  it('the wheel over the free pane zooms; a still press on the free pane arms nothing on the camera', () => {
    const { lab, canvas, panes } = stageLab()
    panes.set(['camera', 'free'])
    render(<Host lab={lab} api={api()} />)
    const at = freeGroundPt(panes)
    moveTo(canvas, at) // the gate arms the pane under the pointer
    const d0 = panes.free.position.distanceTo(panes.freeControls.target)
    fireEvent.wheel(canvas, { ...at, deltaY: -100 })
    expect(panes.free.position.distanceTo(panes.freeControls.target)).toBeLessThan(d0)
  })

  it('a drag on empty ground never marks a spot', () => {
    const { lab, canvas, panes } = stageLab()
    panes.set(['camera', 'free'])
    render(<Probe lab={lab} api={api()} />)
    const at = freeGroundPt(panes)
    press(canvas, at)
    moveTo(canvas, { clientX: at.clientX + 40, clientY: at.clientY + 10 })
    letGo(canvas, { clientX: at.clientX + 40, clientY: at.clientY + 10 })
    expect(pickOf()).toBeNull() // the orbit kept the drag
    expect(menuOf()).toBeNull()
  })
})

describe('figure double-click (L2)', () => {
  /** the hook with the viewer-opening callback the Stage shell wires (it says whether the viewer opened) */
  function DblHost({ lab, api, onFigureDbl }: { lab: ProjectionLabState; api: PlaceApi; onFigureDbl: (pick: { t: 'mark' } | { t: 'piece'; index: number }) => boolean }) {
    useStagePick(lab, api, onFigureDbl)
    return null
  }
  const dblAt = (canvas: Element, at: Pt) => fireEvent.doubleClick(canvas, { ...at, button: 0 })

  it('a double-click on a piece hands the hit to the callback and consumes the press (the pivot never sees it)', () => {
    const { lab, canvas } = stageLab()
    const onFigureDbl = vi.fn(() => true)
    render(<DblHost lab={lab} api={api()} onFigureDbl={onFigureDbl} />)
    const pivotDbls: Event[] = []
    canvas.addEventListener('dblclick', (e) => pivotDbls.push(e)) // what the orbit pivot (pivot.ts) listens with
    dblAt(canvas, screenOf(lab.stage!.view as PerspectiveCamera, CRATES.clone().add(new Vector3(0, 0.4, 0))))
    expect(onFigureDbl).toHaveBeenCalledWith({ t: 'piece', index: 0 })
    expect(pivotDbls.length).toBe(0) // the consumed press stopped in the capture phase, short of the canvas
  })

  it('a double-click on the performer hands the mark; empty ground hands nothing', () => {
    const { lab, canvas, layer } = stageLab()
    const onFigureDbl = vi.fn(() => true)
    render(<DblHost lab={lab} api={api()} onFigureDbl={onFigureDbl} />)
    const mark = layer.group.children.find((c) => c.name === 'mark-figure')!
    dblAt(canvas, screenOf(lab.stage!.view as PerspectiveCamera, mark.position.clone().add(new Vector3(0, 1.2, 0))))
    expect(onFigureDbl).toHaveBeenCalledWith({ t: 'mark' })
    onFigureDbl.mockClear()
    dblAt(canvas, screenOf(lab.stage!.view as PerspectiveCamera, new Vector3(1, 0, 6)))
    expect(onFigureDbl).not.toHaveBeenCalled()
  })

  it('a declined callback (a kit piece has no picture) leaves the press to the canvas', () => {
    const { lab, canvas } = stageLab()
    const onFigureDbl = vi.fn(() => false)
    render(<DblHost lab={lab} api={api()} onFigureDbl={onFigureDbl} />)
    const pivotDbls: Event[] = []
    canvas.addEventListener('dblclick', (e) => pivotDbls.push(e))
    dblAt(canvas, screenOf(lab.stage!.view as PerspectiveCamera, CRATES.clone().add(new Vector3(0, 0.4, 0))))
    expect(onFigureDbl).toHaveBeenCalledWith({ t: 'piece', index: 0 })
    expect(pivotDbls.length).toBe(1) // the pivot keeps its re-place
  })
})

describe('right-click menus', () => {
  /** a canvas point over the Free pane on the given ground spot (the Free pane alone fills the canvas) */
  function freeGround(panes: Panes, x: number, z: number, groundAt: (x: number, z: number) => number): Pt {
    const rect = panes.rect('free', CW, CH)!
    panes.free.updateMatrixWorld()
    const c = new Vector3(x, groundAt(x, z), z).project(panes.free)
    return { clientX: rect.x + ((c.x + 1) / 2) * rect.w, clientY: rect.y + ((1 - c.y) / 2) * rect.h }
  }

  it('a right-click on empty ground in the Free view marks the spot and opens Add here; a left-click closes it (no save, no box)', () => {
    const { lab, canvas, layer, panes } = stageLab()
    panes.set(['free'])
    const a = api()
    render(<Probe lab={lab} api={a} />)
    fireEvent.contextMenu(canvas, { ...freeGround(panes, 1, -6, layer.groundAt), button: 2 })
    const m = menuOf()
    expect(m?.kind).toBeNull()
    expect(m!.at[0]).toBeCloseTo(1, 1)
    expect(m!.at[1]).toBeCloseTo(-6, 1)
    expect(pickOf()).toBeNull()
    expect(a.add).not.toHaveBeenCalled()
    expect(isBoxed(layer)).toBe(false)
    clickAt(canvas, freeGround(panes, 2, -7, layer.groundAt))
    expect(menuOf()).toBeNull()
  })

  it('a left-click on empty ground never opens a menu; a right-click outside the Free view opens none', () => {
    const { lab, canvas, layer } = stageLab() // the Camera pane alone
    render(<Probe lab={lab} api={api()} />)
    clickAt(canvas, groundPt(lab, layer, 1, 6))
    expect(menuOf()).toBeNull()
    fireEvent.contextMenu(canvas, { ...groundPt(lab, layer, 1, 6), button: 2 })
    expect(menuOf()).toBeNull()
  })

  it('a right-click on a piece picks it and opens Swap / Duplicate / Delete; Esc closes it', () => {
    const { lab, canvas } = stageLab()
    render(<Probe lab={lab} api={api()} />)
    fireEvent.contextMenu(canvas, { ...screenOf(lab.stage!.view as PerspectiveCamera, CRATES.clone().add(new Vector3(0, 0.4, 0))), button: 2 })
    expect(pickOf()).toEqual({ t: 'piece', index: 0 })
    expect(menuOf()?.piece).toEqual({ index: 0, swap: true })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(menuOf()).toBeNull()
    expect(pickOf()).toEqual({ t: 'piece', index: 0 })
  })

  it('a right-click on the person picks them and opens their menu; Esc closes it', () => {
    const { lab, canvas, layer } = stageLab()
    render(<Probe lab={lab} api={api()} />)
    const mark = layer.group.children.find((c) => c.name === 'mark-figure')!
    fireEvent.contextMenu(canvas, { ...screenOf(lab.stage!.view as PerspectiveCamera, mark.position.clone().add(new Vector3(0, 1.2, 0))), button: 2 })
    expect(pickOf()).toEqual({ t: 'mark' })
    expect(menuOf()?.person).toBe(true)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(menuOf()).toBeNull()
    expect(pickOf()).toEqual({ t: 'mark' }) // the pick stays: only the menu closed
  })

  it("the browser's own context menu is suppressed on the canvas, never on the app's own chrome", () => {
    const { lab, canvas, layer } = stageLab()
    render(<Probe lab={lab} api={api()} />)
    // fireEvent returns false when the press was cancelled (preventDefault; the viewport's own controls take it too)
    expect(fireEvent.contextMenu(canvas, { ...groundPt(lab, layer, 1, 6), button: 2 })).toBe(false)
    expect(fireEvent.contextMenu(document.body, { button: 2 })).toBe(true) // outside the canvas: not ours to take
  })

  it('a right-click while a path draw is armed opens no menu (the click belongs to the draw)', () => {
    const { lab, canvas, layer } = stageLab()
    render(<Probe lab={lab} api={api()} />)
    setGroundDrawing(true)
    fireEvent.contextMenu(canvas, { ...groundPt(lab, layer, 1, 6), button: 2 })
    expect(menuOf()).toBeNull()
    setGroundDrawing(false)
  })

  it('Swap swaps the picked piece to the chosen kind through the piece route, and closes the menu', async () => {
    const { lab, canvas } = stageLab()
    const a = api()
    render(<Probe lab={lab} api={a} />)
    fireEvent.contextMenu(canvas, { ...screenOf(lab.stage!.view as PerspectiveCamera, CRATES.clone().add(new Vector3(0, 0.4, 0))), button: 2 })
    fireEvent.click(screen.getByTestId('probe-swap'))
    await vi.waitFor(() => expect(a.swap).toHaveBeenCalledWith(ID, 0, plan.kit[0].kind, 'table'))
    expect(menuOf()).toBeNull()
    expect(pickOf()).toEqual({ t: 'piece', index: 0 }) // the piece stays picked, as the old Swap did
  })

  it('Duplicate adds the same piece 0.8 m to its right with no prop tag, and picks it; Delete removes the piece', async () => {
    const { lab, canvas } = stageLab()
    const a = api()
    render(<Probe lab={lab} api={a} />)
    const on = { ...screenOf(lab.stage!.view as PerspectiveCamera, CRATES.clone().add(new Vector3(0, 0.4, 0))), button: 2 }
    fireEvent.contextMenu(canvas, on)
    fireEvent.click(screen.getByTestId('probe-duplicate'))
    const it0 = plan.kit[0]
    await vi.waitFor(() => expect(a.add).toHaveBeenCalledTimes(1))
    const sent = (a.add as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(sent).toMatchObject({ kind: it0.kind, at: [it0.at[0] + 0.8, it0.at[1]] })
    expect(sent.pieceTag).toBeUndefined()
    await vi.waitFor(() => expect(pickOf()).toEqual({ t: 'piece', index: plan.kit.length }))
    expect(menuOf()).toBeNull()
    fireEvent.contextMenu(canvas, on)
    fireEvent.click(screen.getByTestId('probe-delete'))
    await vi.waitFor(() => expect(a.edit).toHaveBeenCalledWith(ID, 0, it0.kind, { remove: true }))
  })
})

describe('the arrange tip (L4)', () => {
  it('clicking its ✕ dismisses it and never marks a spot; the same press shape on the canvas itself still marks', () => {
    sessionStorage.clear()
    const { lab, host, canvas, layer } = stageLab()
    const a = api()
    // the tip rides the viewport's DOM (the canvas' parent), as the shell mounts it — the pick pipeline listens there, in the
    // capture phase, and answers a press only when its target is the canvas. React renders into its own container; moving that
    // container into the host puts the pill beside the canvas, where the shell's LabViewport puts it
    const ui = render(<div><Probe lab={lab} api={a} /><ArrangeTip stage={lab.stage} show /></div>)
    host.appendChild(ui.container)
    expect(screen.getByTestId('stage-tip')).toBeTruthy()
    const x = screen.getByTestId('stage-tip-dismiss')
    fireEvent.pointerDown(x, { button: 0, pointerId: 1 })
    fireEvent.pointerUp(x, { pointerId: 1 })
    fireEvent.click(x)
    expect(screen.queryByTestId('stage-tip')).toBeNull() // dismissed for the session…
    expect(sessionStorage.getItem('canvas-stage.arrangeTip')).toBe('1')
    expect(pickOf()).toBeNull() // …and the press marked no spot
    expect(a.mark).not.toHaveBeenCalled()
    expect(a.add).not.toHaveBeenCalled()
    // the same press shape on the canvas itself lets go: the guard is the pill's DOM target, not where it floats
    clickAt(canvas, screenOf(lab.stage!.view as PerspectiveCamera, CRATES.clone().add(new Vector3(0, 0.4, 0))))
    expect(pickOf()).toEqual({ t: 'piece', index: 0 })
    clickAt(canvas, groundPt(lab, layer, 1, 6))
    expect(pickOf()).toBeNull()
  })
})
