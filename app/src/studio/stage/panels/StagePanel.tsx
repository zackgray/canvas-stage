// The Stage's panel host (merge step 6a, piece route 6b, person 6c, add-here 6d): a router on the one selection — nothing picked →
// the Scene panel (L4: the slim set panel in Free view / Top View, the shot card's camera items in the Camera view); a picked
// piece → its own panel (its name, Remove and its numbers: it is moved, turned and sized in the view); the mark → the Person panel
// (where she stands, her one action). One blocking draft (useBlocking) lives here for the Stage screen's whole life, so switching
// panels never drops a debounced live-save. The panels share the pick's composing state (useSetPlace), so a press here and a drag in the
// viewport are the one selection. The Scene panel and the old Shoot screen assemble the same blocks (screens/ShootScreen.tsx) and
// are never mounted at once, so no press ever exists in two places.
// The object card wave: a person or a prop has ONE card (ObjectCard: the maker and the looks, a prop's pictures and its 3D build)
// over the dimmed viewport; it opens from the right-click menu, a double-click or the panel's own button (a plain click or drag
// only picks or moves — the one exception is a pure click on a person nobody plays yet), and closes with the ✕, Escape, the dim,
// or with the selection itself. The right panel keeps only movement (where they stand, where they go, Walk to a spot).
// W3-E2: this host also renders the viewport right-click menu (StageMenu, portaled over the canvas) and acts its person and travel
// presses — Walk to a spot / Slow walk / Run arm the panel's own walk tool (walkArm.ts), Hold here is its Stay put, Edit look opens
// the card, Move to a spot arms the one shared travel flow (usePropTravel, the card Advanced tab's own logic) — while the piece and
// ground presses (Add kind / swap / Duplicate / Remove / close) go to the pick's choose. A pick that arrived with the menu shows the
// menu, not the card; a left-click pick opens the card as before. The ground menu's Add choice opens the Add dialog (AddDialog:
// the kit list, the set's props, Generate a prop) at the marked spot. Nothing here spends.
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { SetPlaceState } from '../../scene/useSetPlace'
import type { PiecesApi } from '../../scene/piecesApi'
import { MOVE_SPEEDS } from '../../../stage3d/propMove'
import { asksCard, type CardAsk, type StagePick } from '../useStagePick'
import type { MenuChoice, StageMark } from '../railBus'
import { StageMenu } from '../StageMenu'
import { AddDialog } from '../AddDialog'
import { armWalk, holdWalk } from '../walkArm'
import { useBlocking } from './blocking/useBlocking'
import { PersonPanel } from './PersonPanel'
import { PiecePanel } from './PiecePanel'
import { PersonCard } from './PersonLook'
import { PropCard } from './propCard'
import { SpotPicker } from './WalkTo'
import { usePropTravel } from './usePropTravel'
import { ScenePanel, type ScenePanelProps } from './ScenePanel'
import { TakeSetBanner } from './TakeSetBanner'

export interface StagePanelProps extends ScenePanelProps {
  pick: StagePick | null
  /** the one selection (the Stage's own): a panel takes itself off it */
  select: (p: StagePick | null) => void
  /** the one selection's composing state (the Set's own, shared with the viewport's picking) */
  place: SetPlaceState
  /** tests: the Piece panel's pieces api (jsdom has no route) */
  pieces?: PiecesApi
  /** L1: the Camera view (the Camera pane alone) — the Scene panel narrows to camera items */
  cameraView?: boolean
  /** W3-E2: the open viewport right-click menu (the pick's own), rendered over the viewport here */
  menu?: StageMark | null
  /** W3-E2: the pick's menu command handler — the Add kind / swap / Duplicate / Remove / close presses act there */
  chooseMenu?: (c: MenuChoice) => void
  /** the last request for the picked thing's card (useStagePick: a pure click, a page pick or a double-click; a drag asks nothing) */
  cardAsk?: CardAsk | null
}

export function StagePanel({ pick, select, place, pieces, cameraView, menu, chooseMenu, cardAsk, ...props }: StagePanelProps) {
  // the person panels' draft, alive for the screen's whole life (off a kit world it idles empty)
  const b = useBlocking(props.lab.kit.world)
  // the object card (card-on-click, owner 2026-10-29): a click or a drag on a thing only picks or moves it. The card opens from
  // the right-click menu (Character… / Edit look), a double-click, the panels' own buttons — and, by itself, only on a pure click
  // on a person nobody plays yet (the prompt to make their look). It closes with the selection.
  // the card: closed, open, or open on its Advanced tab (the piece panel's Advanced…)
  const [card, setCard] = useState<boolean | 'advanced'>(false)
  const pickKey = pick ? (pick.t === 'mark' ? 'mark' : `piece:${pick.index}`) : null
  useEffect(() => { setCard(false) }, [pickKey])
  const nobody = !props.lab.kit.world?.perf.castId
  useEffect(() => { if (asksCard(cardAsk, pick, nobody)) setCard(true) }, [cardAsk]) // eslint-disable-line react-hooks/exhaustive-deps -- each request is read once, as it arrives
  // the menu's person and travel presses act here; the piece and ground ones go down to the pick's own choose
  const travel = usePropTravel(place)
  // (clear-move, owner 2026-10-29) the saved move goes, exactly as the card's Clear path: the travel tool lets go and the move is
  // written null through the Set's own piece route; the piece stays where it stands. A refusal shows on the piece panel.
  const clearMove = () => { travel.disarm(); void place.setMove(null) }
  // an armed Move to a spot never outlives its piece: a new pick (or none) lets the tool go, so it cannot reappear later
  useEffect(() => { travel.disarm() }, [pickKey]) // eslint-disable-line react-hooks/exhaustive-deps -- once per pick change
  const closeMenu = () => chooseMenu?.({ do: 'close' })
  const onMenu = (c: MenuChoice) => {
    if (c.do === 'walk') { armWalk(c.speed); closeMenu(); return }
    if (c.do === 'stay') { holdWalk(); closeMenu(); return }
    if (c.do === 'editLook') { setCard(true); closeMenu(); return }
    if (c.do === 'moveSpot') { travel.arm(); closeMenu(); return }
    if (c.do === 'clearMove') { clearMove(); closeMenu(); return }
    chooseMenu?.(c)
  }
  // the menu's Move to a spot: the card Advanced tab's own travel flow (usePropTravel) with a single spot — click the spot, it saves
  // the menu floats beside the cursor over the viewport (the canvas' parent is its positioning context)
  const host = props.lab.stage?.renderer?.domElement.parentElement ?? null
  const frame = { w: host?.clientWidth ?? 0, h: host?.clientHeight ?? 0 }
  const menuItem = menu?.piece ? props.lab.kit.world?.plan.kit[menu.piece.index] ?? null : null
  const menuPiece = menu?.piece
    ? { name: menuItem?.label?.trim() || menuItem?.kind || '', swap: menu.piece.swap, hasCard: !!menuItem?.pieceTag?.startsWith('prop:'), moves: !!menuItem?.move }
    : null
  const menuOverlay = host
    ? createPortal(<StageMenu mark={menu ?? null} piece={menuPiece} frame={frame} onChoose={onMenu} />, host)
    : null
  const travelPicker = travel.armed && props.lab.stage && place.item ? (
    <SpotPicker lab={props.lab} from={[place.item.at[0], place.item.at[1]]}
      onSpot={(p) => { travel.disarm(); void travel.save([p], MOVE_SPEEDS[1].mps, true) }}
      onCancel={travel.disarm} />
  ) : null
  let body: ReactNode
  if (pick?.t === 'piece') {
    body = (
      <>
        <PiecePanel place={place} lab={props.lab} pieces={pieces} onOpenCard={() => setCard(true)} onOpenAdvanced={() => setCard('advanced')} onClearMove={clearMove} />
        {card && <PropCard key={String(card)} place={place} lab={props.lab} pieces={pieces} startTab={card === 'advanced' ? 'advanced' : 'look'} onClose={() => setCard(false)} />}
      </>
    )
  } else if (pick?.t === 'mark') {
    body = (
      <>
        <PersonPanel lab={props.lab} b={b} place={place} onOpenCard={() => setCard(true)} />
        {card && <PersonCard world={props.lab.kit.world} onClose={() => setCard(false)} />}
      </>
    )
  } else {
    body = <ScenePanel {...props} cameraView={cameraView} pieces={pieces} place={place} select={select} />
  }
  // the menu's Add choice (a marked spot with a kind): the Add dialog, over the dimmed viewport; any close drops the mark
  const addDialog = menu && !menu.person && !menu.piece && menu.kind
    ? <AddDialog lab={props.lab} place={place} at={menu.at} kind={menu.kind} onClose={closeMenu} />
    : null
  return <><TakeSetBanner lab={props.lab} />{body}{menuOverlay}{travelPicker}{addDialog}</>
}
