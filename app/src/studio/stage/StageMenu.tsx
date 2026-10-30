// The viewport right-click menu (W3-E2, the mock's .ctx): opens beside the cursor, kept inside the frame, for the person (Walk to
// a spot / Slow walk / Run / Hold here · Character…), a piece (Move to a spot / Edit look / Duplicate · Remove '<name>'; a plain
// piece keeps its Swap — the kit kinds as a second level), or empty ground (Add here · A prop / A set piece, unchanged). The first
// item is focused; Arrow keys move, Enter picks, Escape or a press elsewhere closes (the pick pipeline closes it too); a press
// hands the whole command to the panel host, so nothing is decided here. No press ever spends. DOM only, portaled over the
// viewport by StagePanel; the st-addmenu class is deliberate — shotRelease's guard reads it.
import { useEffect, useRef, useState } from 'react'
import type { MenuChoice, StageMark } from './railBus'
import { SWAP_KINDS } from './railModel'

/** one row; '—' is the rule between groups */
type Row = { id: string; label: string; cmd: MenuChoice; danger?: boolean } | '—'

/** the piece menu's target, read off the plan by the panel host */
export interface StageMenuPiece {
  /** its display name: the Remove row reads Remove '<name>' */
  name: string
  /** a built piece keeps its own kind: no Swap row */
  swap: boolean
  /** a prop (a tagged piece) has the object card: the Edit look row */
  hasCard: boolean
  /** it has a saved move: the Clear move row */
  moves?: boolean
}

/** how wide/tall the menu is allowed to be before it must give way at the frame's edge (the mock's clamp) */
const MENU_W = 220
const MENU_H = 260

const personRows = (): Row[] => [
  { id: 'walk', label: 'Walk to a spot', cmd: { do: 'walk', speed: 'walk' } },
  { id: 'walk-slow', label: 'Slow walk', cmd: { do: 'walk', speed: 'slow' } },
  { id: 'run', label: 'Run', cmd: { do: 'walk', speed: 'run' } },
  { id: 'stay', label: 'Hold here', cmd: { do: 'stay' } },
  '—',
  { id: 'edit-look', label: 'Character…', cmd: { do: 'editLook' } },
]

const pieceRows = (piece: StageMenuPiece): Row[] => [
  ...(piece.swap ? [{ id: 'swap', label: 'Swap', cmd: { do: 'close' } as MenuChoice }] : []),
  { id: 'move-spot', label: 'Move to a spot', cmd: { do: 'moveSpot' } },
  ...(piece.moves ? [{ id: 'clear-move', label: 'Clear move', cmd: { do: 'clearMove' } as MenuChoice }] : []),
  ...(piece.hasCard ? [{ id: 'edit-look', label: 'Edit look', cmd: { do: 'editLook' } as MenuChoice }] : []),
  { id: 'duplicate', label: 'Duplicate', cmd: { do: 'duplicate' } },
  '—',
  { id: 'remove', label: `Remove '${piece.name}'`, cmd: { do: 'delete' }, danger: true },
]

const swapRows = (): Row[] => [
  { id: 'swap-back', label: '‹ Back', cmd: { do: 'close' } },
  ...SWAP_KINDS.map((kind) => ({ id: `swap-${kind}`, label: kind, cmd: { do: 'swap', kind } as MenuChoice })),
]

const groundRows = (): Row[] => [
  { id: 'add-prop', label: 'A prop', cmd: { do: 'add', kind: 'prop' } },
  { id: 'add-piece', label: 'A set piece', cmd: { do: 'add', kind: 'piece' } },
]

export function StageMenu({ mark, piece, frame, onChoose }: {
  /** the open menu (null = none); a chosen Add kind hands over to the Add dialog and shows nothing */
  mark: StageMark | null
  /** the piece target's facts (piece menus only) */
  piece?: StageMenuPiece | null
  /** the viewport frame's size (px): the menu stays inside it */
  frame: { w: number; h: number }
  onChoose: (c: MenuChoice) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  /** the piece menu's second level: the kit kinds a plain piece can swap to (per open menu, so a new right-click resets it) */
  const [swapMark, setSwapMark] = useState<StageMark | null>(null)
  const swapping = swapMark !== null && swapMark === mark && !!mark?.piece
  // the first row is focused whenever the menu (or its swap level) shows (the mock: the first item focused)
  useEffect(() => {
    if (mark) ref.current?.querySelector('button')?.focus()
  }, [mark, swapping])
  // a press outside closes it (a press on the canvas closes it in the pick pipeline; this covers the rest of the app)
  useEffect(() => {
    if (!mark || mark.kind !== null) return // a chosen Add kind hands over to the Add dialog, which owns its own presses
    const down = (e: PointerEvent) => { if (e.button === 0 && !ref.current?.contains(e.target as Node)) onChoose({ do: 'close' }) }
    window.addEventListener('pointerdown', down, true)
    return () => window.removeEventListener('pointerdown', down, true)
  }, [mark, onChoose])
  if (!mark || mark.kind !== null) return null

  let rows: Row[]
  if (mark.person) rows = personRows()
  else if (mark.piece) {
    if (!piece) return null
    rows = swapping ? swapRows() : pieceRows(piece)
  } else rows = groundRows()
  const pick = (row: Row) => {
    if (row === '—') return
    if (row.id === 'swap') { setSwapMark(mark); return }
    if (row.id === 'swap-back') { setSwapMark(null); return }
    onChoose(row.cmd)
  }
  const left = Math.max(0, Math.min(mark.px.x, frame.w - MENU_W))
  const top = Math.max(0, Math.min(mark.px.y, frame.h - MENU_H))
  // the arrows walk the rows; Enter (or Space) presses the focused row — said here too, not only left to the button
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter' && e.key !== ' ') return
    const btns = [...ref.current!.querySelectorAll('button')]
    if (e.key === 'Enter' || e.key === ' ') {
      const on = btns.find((b) => b === document.activeElement)
      if (on) { e.preventDefault(); on.click() }
      return
    }
    const i = btns.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.key === 'ArrowDown' ? (i + 1) % btns.length : (i - 1 + btns.length) % btns.length
    btns[next]?.focus()
    e.preventDefault()
  }
  return (
    <div ref={ref} className="st-addmenu st-ctxmenu" role="menu" data-testid="stage-menu" style={{ left, top }} onKeyDown={onKey}>
      {!mark.person && !mark.piece && <b>Add here</b>}
      {rows.map((row, i) => row === '—'
        ? <hr key={`r${i}`} />
        : (
          <button key={row.id} type="button" role="menuitem" data-testid={`stage-menu-${row.id}`}
            className={row.danger ? 'dng' : undefined} onClick={() => pick(row)}>{row.label}</button>
        ))}
    </div>
  )
}
