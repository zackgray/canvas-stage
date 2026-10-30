// Which words the Stage's Prompt drawer shows (one-prompt, owner 10-29): there is one place to type a prompt, the drawer, labelled
// "Prompt". With a take on show it edits that take's words (what its draw and render read), the take named under the label; clicking
// another take puts that take's words in the box. With no take on show (a take being filmed, or filmed and not locked yet, or none
// picked) it shows, read-only, the words the next take starts from: the take last on show, else the world's newest (lastTake.ts, the
// same take the lock copies from). Before the world has any take the box holds the words underneath every take (stored as the scene
// prompt, a name the page never shows): the first take copies them.
import { useEffect, useRef, useState } from 'react'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import type { TakeBoardRow } from '../../shared/takeWordsContract'
import { useMemoryTakeLocked } from '../shoot/currentTake'
import { useTakeRowOnShow } from './TakeWords'
import { useTakeBoard } from '../shoot/takeBoard'
import { seedRow, useLastTakeId } from '../shoot/lastTake'

const OPEN_POLL_MS = 250

/** a take filmed and not locked yet, or filming now (the take list's own "open" row): read from the engine, which lives outside React */
export function useTakeOpen(lab?: ProjectionLabState | null): boolean {
  const memoryLocked = useMemoryTakeLocked()
  const ref = useRef(lab)
  ref.current = lab
  const read = () => {
    const d = ref.current?.op?.engine?.deck
    return !!d && (!!d.recording || (!!d.take && !memoryLocked))
  }
  const [open, setOpen] = useState(read)
  useEffect(() => {
    setOpen(read())
    const t = setInterval(() => setOpen(read()), OPEN_POLL_MS)
    return () => clearInterval(t)
  }, [memoryLocked]) // read() sees the lab through its ref
  return open
}

/** the drawer's one name for its box, whatever it shows */
export const PROMPT_LABEL = 'Prompt'

export interface DrawerMode {
  /** the take on show, whose words the drawer edits; null = no take on show */
  take: TakeBoardRow | null
  /** no take on show: the take the next take's words come from (shown read-only); null = no take yet (the box is the words before any take) */
  seed: TakeBoardRow | null
  /** a take is being filmed or is filmed and not locked yet */
  open: boolean
  label: string
}

export function useDrawerMode(worldId: string | null, lab?: ProjectionLabState | null): DrawerMode {
  const row = useTakeRowOnShow(worldId)
  const open = useTakeOpen(lab)
  const { rows } = useTakeBoard(worldId)
  const last = useLastTakeId()
  const take = open ? null : row
  return { take, seed: take ? null : seedRow(rows, last), open, label: PROMPT_LABEL }
}
