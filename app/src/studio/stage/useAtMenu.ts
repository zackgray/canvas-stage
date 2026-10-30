// The "@" pick-list for a words box that is not the scene brief (the take's own words): the same menu and the same rows the scene
// drawer has (pieces of the scene, then saved cards), picking one puts its @tag in. A saved card is used in the scene as it is
// (adopt, free). Nothing is made by typing here: a tag the scene lacks is said in plain words instead (TakeWords).
import { useState, type KeyboardEvent } from 'react'
import { atToken, putTag } from '../scene/design/briefText'
import { atRows, type AtRow } from '../scene/design/routes'
import { useStageScene } from './scene/StageScene'

export function useAtMenu(text: string, caret: number, live: boolean, onText: (t: string, caret: number) => void) {
  const st = useStageScene()
  const [active, setActive] = useState(0)
  const tok = live && st ? atToken(text, caret) : null
  const rows: AtRow[] = tok && st ? atRows(st.x.s.d.pieces, st.x.lib, tok.q) : []
  const at = Math.min(active, Math.max(rows.length - 1, 0))
  const pick = (r: AtRow) => {
    if (!tok || !st) return
    if (r.lib) st.x.s.adopt(r.lib)
    const next = putTag(text, tok.start, caret, r.tag)
    onText(next.text, next.caret)
    setActive(0)
  }
  /** arrows move, Enter / Tab pick; true = the key was the menu's */
  const onKey = (e: KeyboardEvent): boolean => {
    if (!rows.length) return false
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length); return true }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(rows[at]); return true }
    return false
  }
  return { rows, active: at, pick, onKey }
}
