// The words drawer under the Stage's viewport (review item 1, F14): the scene brief the next draw and render use, on the Stage, so
// the loop words -> draw -> look -> change a word -> redraw never leaves it. Collapsed, one line of the brief with its @chips;
// a click opens it to a comfortable box that grows with the words, editing at once, the Board's own brief box (BriefEditor) on the Stage's one copy of the
// scene design (StageScene.tsx). The one Draw the first frame press is the steps block's own (ShotSteps.tsx): the loop never
// leaves the drawer, so the drawer's line of the press is gone (duplicate-draw-buttons). Under the box, quiet and local only:
// a note when the words carry camera or lens language (a pasted prompt's "low-angle tracking shot, 85mm lens": the camera is set
// on the Stage) with a Tidy press that strips just those phrases and a visible Undo, a one-line hint to type @ when no tag is in
// the words yet, and — the first time words land in an untouched scene — the scene is named from them, so Resume never fills
// with indistinguishable "Untitled scene" rows. Collapsed by default when the window is under 800 px tall. With a take on show the
// drawer IS that take's prompt (TakeWords.tsx: what its draw and render read), the take named under "Prompt"; with no take on show it
// shows the words the next take starts from, and before any take the words every take starts from (one-prompt: drawerMode.ts).
// To the right of the box, the take card (TakeCard.tsx, owner 10-29): the named take's Draw the first frame, then its first frame
// and its clip.
import { useEffect, useRef, useState } from 'react'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { libraryApi } from '../../library/api'
import { refreshScene } from '../../library/currentScene'
import { DEFAULT_SCENE_NAME } from '../../shared/libraryContract'
import { runs } from '../scene/design/briefText'
import { BriefEditor } from '../scene/BriefEditor'
import { Chip } from '../scene/parts'
import { StageSceneProvider, useStageScene, type StageScene, type StageSceneDeps } from './scene/StageScene'
import { nameFromWords } from './firstWordsState'
import { hasCameraWords, stripCameraPhrases } from './promptWarn'
import type { TakeBoardRow } from '../../shared/takeWordsContract'
import { TakeWords } from './TakeWords'
import { TakeCard } from './TakeCard'
import { useDrawerMode, type DrawerMode } from './drawerMode'
import { takeLabel } from './TakeList'
import { NoTagHint } from './WordsNotes'
import '../scene/design.css'
import './promptDrawer.css'

export { NoTagHint }

/** the Prompt box's line while it is empty */
export const PROMPT_PLACEHOLDER = 'Write your prompt: describe the shot, and type @ to tag a person or prop once you have made them'

/** under this window height the drawer opens collapsed (the viewport keeps its room) */
export const DRAWER_TALL = 800
/** the owner's open/closed choice on this page (a tab switch unmounts the drawer; it comes back as it was left) */
let chosen: boolean | null = null
export const resetDrawerChoice = () => { chosen = null }
const openAtStart = () => chosen ?? (typeof window === 'undefined' || window.innerHeight >= DRAWER_TALL)

/** the drawer for the Stage's scene (nothing until its design is there) */
export function PromptDrawer({ lab }: { lab?: ProjectionLabState }) {
  const st = useStageScene()
  return st ? <DrawerView key={st.scene} st={st} lab={lab} /> : null
}

/** a drawer on a scene design of its own (tests of the drawer alone; the app mounts PromptDrawer inside the shell's provider) */
export function Drawer({ scene, worldId, deps }: { scene: string; worldId: string | null; deps?: StageSceneDeps }) {
  return <StageSceneProvider scene={scene} worldId={worldId} lab={NO_LAB} deps={deps}><PromptDrawer /></StageSceneProvider>
}
const NO_LAB = { kit: { id: null, world: null } } as unknown as ProjectionLabState

function DrawerView({ st, lab }: { st: StageScene; lab?: ProjectionLabState }) {
  const { x } = st
  const { s } = x
  const [open, setOpenNow] = useState(openAtStart)
  const setOpen = (v: boolean) => { chosen = v; setOpenNow(v) }
  const root = useRef<HTMLDivElement>(null)
  // a take on show draws from its own words (TakeWords.tsx): the drawer shows and edits those, unless the owner switched to the scene's
  const mode = useDrawerMode(st.worldId, lab)
  const { take, seed } = mode
  const expand = () => {
    setOpen(true)
    // open means editing: the take's words box, else the brief box's own click (the cursor at the end), once it is on screen
    requestAnimationFrame(() => (take ? root.current?.querySelector<HTMLElement>('[data-testid="take-words-input"]')?.focus()
      : root.current?.querySelector<HTMLElement>('[data-testid="stage-brief-view"]')?.click()))
  }
  const brief = s.d.brief.trim()
  useSceneNameFromWords(st.scene, brief)
  // a scene with no words yet (a new scene from Home): the box is open and focused on arrival, ready to type (no card over the Stage)
  const arrived = useRef(false)
  useEffect(() => {
    if (!s.synced || arrived.current) return
    arrived.current = true
    if (brief || take || seed) return
    setOpenNow(true)
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[data-testid="stage-brief-input"]')?.focus())
  }, [s.synced]) // eslint-disable-line react-hooks/exhaustive-deps
  // the words on one line with their @chips; a tag the scene has no tile for shows as a gone (red) chip, never a new tile
  const chips = (words: string) => runs(words).map((m, i) => ('tag' in m
    ? <Chip key={i} tag={m.tag} type={s.d.pieces.find((p) => p.tag === m.tag)?.type} gone={!s.d.pieces.some((p) => p.tag === m.tag)} />
    : <span key={i}>{m.text}</span>))
  return (
    <div ref={root} className={`st-drawer${open ? ' st-drawer-open' : ''}`} data-testid="prompt-drawer">
      {!s.synced ? <p className="st-muted st-drawer-line" data-testid="drawer-reading">Reading the prompt…</p>
        : open ? (
          <>
            <div className="st-drawer-head">
              <button type="button" className="st-drawer-hide" data-testid="drawer-hide" title="Fold the prompt to one line" onClick={() => setOpen(false)}>
                <span data-testid="drawer-mode-label">{mode.label}</span> ▾</button>
              {take && <TakeName row={take} />}
            </div>
            <div className="st-drawer-edit">
              {take ? <TakeWords worldId={st.worldId} /> : seed ? <SeedWords mode={mode} seed={seed} /> : (
                <>
                  <BriefEditor x={x} testId="stage-brief" placeholder={PROMPT_PLACEHOLDER} words />
                  <CameraWordsNote brief={x.s.d.brief} onEdit={(t) => x.s.editBrief(t)} />
                  <NoTagHint brief={x.s.d.brief} />
                </>
              )}
            </div>
          </>
        ) : (
          <button type="button" className="st-drawer-line" data-testid="drawer-line" title="Open the prompt to change it" onClick={expand}>
            <span className="st-drawer-label" data-testid="drawer-mode-label">{mode.label} ▸</span>
            {take && <TakeName row={take} />}
            <span className="st-drawer-text" data-testid="drawer-text">
              {take ? <span data-testid="drawer-take-text">{take.words.trim() ? chips(take.words) : 'No prompt in this take yet: click to write it.'}</span>
                : seed ? <span data-testid="drawer-seed-text">{seed.words.trim() ? chips(seed.words) : <span className="st-muted">No prompt yet.</span>}</span>
                : brief ? chips(s.d.brief)
                : <span className="st-muted">No prompt yet: click to write it.</span>}
            </span>
          </button>
        )}
      {lab && s.synced && <TakeCard lab={lab} takeId={take?.id ?? null} />}
      {s.saveError && (
        <p className="st-warn st-drawer-error" role="alert" data-testid="drawer-save-error">{s.saveError}
          {s.stale && <> <button type="button" className="st-btn" onClick={() => window.location.reload()}>Reload</button></>}
        </p>
      )}
    </div>
  )
}

/** the take whose words the box holds, under (or beside, folded) the label: one line, ellipsised */
function TakeName({ row }: { row: TakeBoardRow }) {
  const name = takeLabel(row)
  return <span className="st-drawer-take" data-testid="drawer-take-name" title={name}>{name}</span>
}

/**
 * No take on show: the words the next take starts from (the take last on show, else the newest), read-only; a take is edited by
 * putting it on show (its row in the take list), or once the take being filmed is locked
 */
function SeedWords({ mode, seed }: { mode: DrawerMode; seed: TakeBoardRow }) {
  return (
    <div className="st-takewords" data-testid="drawer-seed">
      <div className="st-takewords-box">
        <textarea data-testid="drawer-seed-words" value={seed.words} readOnly spellCheck={false} aria-label="The words the next take starts from" />
      </div>
      <span className="st-drawer-note" data-testid="drawer-seed-note">
        {mode.open ? 'This take starts from these words once you lock it; then you can change them.' : 'A new take starts from these words. Pick a take in the list to change its words.'}
        {' '}(From {takeLabel(seed)}.)</span>
    </div>
  )
}

/**
 * The first words name the scene (first-words-focus-and-names): when words land in a scene that is still the untouched default,
 * it is renamed from them. The name waits for a pause in the typing (it was taken from the first letter typed: a scene called
 * "J"), and keeps following the first sentence while the name is still the one set here; a name the owner gave is never touched.
 * A quiet convenience: a failed read or rename says nothing and touches nothing else.
 */
const NAME_PAUSE_MS = 600
function useSceneNameFromWords(scene: string, brief: string) {
  const mine = useRef<string | null>(null) // the name set from the words, while it is still the scene's name
  useEffect(() => {
    if (!brief.trim()) return
    const name = nameFromWords(brief)
    if (!name) return
    const t = setTimeout(() => void (async () => {
      try {
        const api = libraryApi()
        const doc = await api.get(scene)
        if (!doc || (doc.name !== DEFAULT_SCENE_NAME && doc.name !== mine.current)) { mine.current = null; return }
        if (doc.name === name) return
        await api.rename(scene, name, doc.revision)
        mine.current = name
        void refreshScene() // the top bar shows it now, not at the next poll
      } catch { /* the name is a convenience, never an alarm */ }
    })(), NAME_PAUSE_MS)
    return () => clearTimeout(t)
  }, [scene, brief])
}

/**
 * The quiet camera-language note (paste-camera-flag), under the words box of the card and the drawer: shows when the words carry
 * shot-list language (a pasted prompt), never edits them by itself. Tidy strips just those phrases (local text rules only); Undo
 * puts them back; the × dismisses the note until the words change.
 */
export function CameraWordsNote({ brief, onEdit }: { brief: string; onEdit: (next: string) => void }) {
  const [dismissedFor, setDismissedFor] = useState<string | null>(null)
  const [beforeTidy, setBeforeTidy] = useState<string | null>(null)
  const found = hasCameraWords(brief)
  if ((!found && beforeTidy === null) || dismissedFor === brief) return null // after Tidy the note stays for its Undo
  const tidy = () => { setBeforeTidy(brief); onEdit(stripCameraPhrases(brief)) }
  return (
    <p className="st-cam-note" data-testid="camera-words-note">
      The camera is set on the Stage, so these words may confuse the draw.{' '}
      {beforeTidy === null
        ? <button type="button" className="st-link" data-testid="camera-words-tidy" onClick={tidy}>Tidy</button>
        : <button type="button" className="st-link" data-testid="camera-words-undo"
            onClick={() => { onEdit(beforeTidy); setBeforeTidy(null) }}>Undo</button>}
      <button type="button" className="st-link st-cam-note-x" data-testid="camera-words-dismiss" title="Hide this note"
        onClick={() => { setDismissedFor(brief); setBeforeTidy(null) }}>×</button>
    </p>
  )
}
