// The option rail's bus (layout wave L2; L3 adds the Add mark; W3-E2: the right-click menu's state rides it): the rail floats
// over the viewport (mounted by the shell) while its content is built where the selection lives (the Stage workspace), so the two
// talk through these contexts — the workspace publishes what the selection names and the marked spot, the rail renders it. The
// actions (`publish`, `figureDbl`, `setMark`, `chooseAdd`, `registerAddChooser`) are stable forever, and the content, the mark and
// the double-click counter are their own contexts, so publishing never re-renders the publisher (a loop would reopen what the
// owner just closed). `dbl` counts figure double-clicks: the rail opens its viewer on the current card when it moves. `mark` is
// the open right-click menu (W3-E2): the person menu, a right-clicked piece's, or the marked spot's "Add here" on empty ground;
// the panel host (StagePanel) renders it over the viewport and the menu's press reaches the pick's own `choose` through
// `registerChooser` (the workspace registers it) for the piece and ground commands.
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { RailContent } from './railModel'
import type { WalkSpeedId } from './walkArm'

/** L3: what the Add menu offers (the rail opens in Add mode on the chosen one); a person is made in The subject's panel */
export type AddKind = 'prop' | 'piece'
/**
 * What a viewport right-click menu press asks for (the W3-E2 menu): the ground's Add kind, a swap target kind, the person
 * menu's walk / hold / Edit look, the piece menu's Move to a spot, Duplicate / Delete, or closing the menu. The pick's own
 * choose (useStagePick) acts the piece and ground ones; the panel host (StagePanel) acts the person and travel ones.
 */
export type MenuChoice =
  | { do: 'add'; kind: AddKind }
  | { do: 'swap'; kind: string }
  | { do: 'duplicate' }
  | { do: 'delete' }
  | { do: 'walk'; speed: WalkSpeedId }
  | { do: 'stay' }
  | { do: 'editLook' }
  | { do: 'moveSpot' }
  /** the picked piece's saved move goes (it stays where it stands) */
  | { do: 'clearMove' }
  | { do: 'close' }
/**
 * The open menu: its ground point (metres), its corner beside the cursor (px, viewport-relative) and the chosen Add kind; `piece`
 * makes it a right-clicked piece's menu (its plan index, and whether it can be swapped: a built piece keeps its own kind);
 * `person` makes it the person's menu (a right-click on the performer).
 */
export interface StageMark { at: [number, number]; px: { x: number; y: number }; kind: AddKind | null; person?: boolean; piece?: { index: number; swap: boolean } }

/** the stable side: publish what the selection names; a figure was double-clicked; the menu changed; a menu entry was pressed */
export interface RailActions {
  publish: (c: RailContent | null) => void
  figureDbl: () => void
  setMark: (m: StageMark | null) => void
  choose: (k: MenuChoice) => void
  /** the workspace hands its pick's `choose` over: the rail's menu buttons press it (null unregisters) */
  registerChooser: (fn: ((k: MenuChoice) => void) | null) => void
}
/** the rail side: the published content and mark, the figure-double-click counter */
export interface RailBus extends RailActions {
  content: RailContent | null
  mark: StageMark | null
  dbl: number
}

const ActionsCtx = createContext<RailActions | null>(null)
const ContentCtx = createContext<RailContent | null>(null)
const MarkCtx = createContext<StageMark | null>(null)
const DblCtx = createContext<number>(0)

/** the shell wraps the viewport and the screen in this, so the rail (a viewport child) reads what the workspace publishes */
export function StageRailProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<RailContent | null>(null)
  const [mark, setMarkState] = useState<StageMark | null>(null)
  const [dbl, setDbl] = useState(0)
  const chooser = useRef<((k: MenuChoice) => void) | null>(null)
  const actions = useMemo<RailActions>(() => ({
    publish: setContent,
    figureDbl: () => setDbl((n) => n + 1),
    setMark: setMarkState,
    choose: (k) => chooser.current?.(k),
    registerChooser: (fn) => { chooser.current = fn },
  }), [])
  return (
    <ActionsCtx.Provider value={actions}>
      <ContentCtx.Provider value={content}>
        <MarkCtx.Provider value={mark}>
          <DblCtx.Provider value={dbl}>{children}</DblCtx.Provider>
        </MarkCtx.Provider>
      </ContentCtx.Provider>
    </ActionsCtx.Provider>
  )
}

/** the workspace side: the stable actions (publish never re-renders the caller) */
export function useRailActions(): RailActions {
  const actions = useContext(ActionsCtx)
  if (!actions) throw new Error('useRailActions outside StageRailProvider')
  return actions
}

/** the rail side: the published content and mark, the figure-double-click counter */
export function useRailBus(): RailBus {
  const actions = useContext(ActionsCtx)
  if (!actions) throw new Error('useRailBus outside StageRailProvider')
  return { ...actions, content: useContext(ContentCtx), mark: useContext(MarkCtx), dbl: useContext(DblCtx) }
}
