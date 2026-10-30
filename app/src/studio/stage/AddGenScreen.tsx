// The "A new prop" screen (layout wave L3): the last card of the Add-mode rail ("+ Generate a prop") opens it in the viewer area —
// a label, a large "Describe it" box, "or upload a photo" (an upload is a candidate as is, free), the real cost on the Draw button
// and Cancel. Draw runs the same paid route the Board's piece details use (briefApi.candidates, a draft concept draw) and the
// candidates land in the rail as NEW cards; clicking one makes it the scene's own prop, places it at the marked spot and builds it
// in 3D once (about a minute, its own price, on the piece panel). A paid press, so the prompt that will go sits in a box with the
// warn-only checks under it (PromptWarnings) and a pasted prompt goes as typed. The stepper beside Draw sets how many candidates
// the one press draws (1..4, one by default) and the button's price follows it. No route adds a person, so there is no person
// screen. It never closes on an outside click (a stray click must not discard typed text): Cancel, ✕ and Esc only.
// (add-prop-review, owner 2026-10-29) The drawn candidates show here, in the dialog, each with Use this one (the 3D build's price
// on it) and Draw another candidate (AddGenPicks.tsx); Use this one places it at the marked spot and starts its one build. A failed
// or empty draw, or a placement that was refused, is said here in plain words and the dialog stays open.
// (add-prop-words, owner 2026-10-29) The same two tabs as the person card: DESCRIBE (label, Describe it, the priced Draw with its
// count, the review) and ADVANCED (the person card's own boxes for the parts a prop draw adds — View, How the picture is taken,
// Light, Rules — PropDrawParts.tsx). Describe it is the prop's words and stays on DESCRIBE; each box changes only its own part.
// (prop-edits-hold, owner 2026-10-29: a side view typed in View came back as the front view) Each drawn candidate keeps the parts
// it was drawn with, so the review reopened on one (a click on its card in the list) opens with them, not the defaults; the tabs
// are the person card's own bar and ADVANCED its full column (prop-advanced-same).
import { useEffect, useMemo, useRef, useState } from 'react'
import { AddGenPicks } from './AddGenPicks'
import { PropDrawParts } from './panels/PropDrawParts'
import { SentLine } from './panels/SentLine'
import type { PropParts } from '../../shared/sceneContract'
import { conceptPrompt } from '../../../server/scene/conceptText.ts'
import { PromptWarnings } from '../PromptWarnings'
import type { FreshLook } from './freshLooks'
import { UPLOAD_DESC } from './stageProp'
import { GenCount } from '../scene/GuidedStage'
import '../scene/guided.css'
import { PriceButton, RunPill, STILL_ESTIMATE } from '../ui'
import { promptWarnings } from './promptWarn'
import { addGenDraft, clearAddGenDraft, saveAddGenDraft } from './addGenDraft'

export interface AddGenScreenProps {
  /** the real cost of the draw at a count, from the price data (shown before anything runs) */
  price: (count: number) => number
  /** the paid draw: the name, description and count go as shown; resolves with the drawn candidate urls */
  draw: (name: string, description: string, count: number, parts?: PropParts) => Promise<string[]>
  /** an uploaded photo becomes a candidate as is (free); absent = no upload route */
  upload?: (f: File) => Promise<string>
  /** the 3D build's price (the pieces route's), said before the pick that starts it; null = not read yet */
  buildPrice?: number | null
  /** a candidate approved: placed at the marked spot and built once; throws in words (the dialog closes on success) */
  approve?: (look: FreshLook) => Promise<void>
  /** a draw or a placement is running (the dialog's Escape waits for it) */
  onBusy?: (busy: boolean) => void
  /** the drawn candidates already in the list, and the one picked there (the review opens on it) */
  initial?: { looks: FreshLook[]; sel: number }
  onClose: () => void
}

/** the prompt screen for a new prop, over the viewport (inside the Add dialog) */
export function AddGenScreen({ price, draw, upload, buildPrice, approve, onBusy, initial, onClose }: AddGenScreenProps) {
  // a drawn candidate picked in the list behind opens here with its words and every drawn candidate, that one selected
  // (add-prop-draft) a fresh open (no candidate picked behind) starts from the unsent words left by the last close
  const [draft] = useState(() => (initial ? null : addGenDraft()))
  const [name, setName] = useState(initial?.looks[initial.sel]?.name.split(' · ')[0] ?? draft?.name ?? '')
  const [desc, setDesc] = useState(initial?.looks[initial.sel]?.desc ?? draft?.desc ?? '')
  const [count, setCount] = useState(1)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'describe' | 'advanced'>('describe')
  // the prop's words (Describe it, or the label when it is empty) and the ADVANCED parts' edits (none = the defaults)
  const [parts, setParts] = useState<PropParts>(initial?.looks[initial.sel]?.parts ?? draft?.parts ?? {})
  const edited = Object.keys(parts).length > 0
  const prompt = (desc.trim() || name.trim()).split('\n').join(' ')
  const warnings = useMemo(() => promptWarnings(prompt), [prompt])
  const [looks, setLooks] = useState<FreshLook[]>(initial?.looks ?? [])
  const [placing, setPlacing] = useState<string | null>(null)
  // a second press in the same moment (before the screen re-renders) is the same press: one draw, one placement, one build
  const inFlight = useRef(false)
  useEffect(() => { onBusy?.(busy || placing !== null) }, [busy, placing, onBusy])
  // the words are kept as typed (a review opened on a drawn candidate leaves the draft alone)
  useEffect(() => { if (!initial) saveAddGenDraft({ name, desc, parts }) }, [initial, name, desc, parts])
  const label = name.trim() || 'New prop'
  const start = async (n: number) => {
    if (busy || placing || inFlight.current || !prompt) return // cleared words draw nothing (never the label instead)
    inFlight.current = true
    setBusy(true); setError(null); setDone(null)
    try {
      const urls = edited ? await draw(name, prompt, n, parts) : await draw(name, prompt, n)
      if (!urls.length) setDone('The draw brought nothing back. Try different words.')
      else if (approve) setLooks((l) => [...l, ...urls.map((url) => ({ url, name: label, desc: prompt, ...(edited ? { parts } : {}) }))])
      else setDone(`${urls.length} ${urls.length === 1 ? 'candidate' : 'candidates'} added to the list — Cancel to go back and pick one.`)
    } catch (e) {
      setError(`The draw did not work: ${e instanceof Error ? e.message : String(e)}`)
    } finally { inFlight.current = false; setBusy(false) }
  }
  const use = async (f: FreshLook) => {
    if (!approve || busy || placing || inFlight.current) return
    inFlight.current = true
    setPlacing(f.url); setError(null)
    try { await approve({ ...f, name: label }); clearAddGenDraft() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { inFlight.current = false; setPlacing(null) }
  }
  const pick = async (f: File | undefined) => {
    if (!f || !upload) return
    setError(null)
    try {
      const url = await upload(f)
      if (approve) setLooks((l) => [...l, { url, name: label, desc: UPLOAD_DESC }])
      else setDone('The photo was added to the list as is.')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  return (
    <div className="st-viewer" data-testid="add-gen" role="dialog" aria-label="A new prop">
      <div className="oc-tabs ad-tabs" role="tablist" aria-label="Draw sections">
        {(['describe', 'advanced'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} data-testid={`add-gen-tab-${t}`} onClick={() => setTab(t)}>
            {t === 'describe' ? 'DESCRIBE' : `ADVANCED${edited ? ' · edited' : ''}`}</button>
        ))}
      </div>
      <div className="st-gen-big">
        <button type="button" className="st-viewer-x" data-testid="add-gen-close" onClick={onClose}>Esc ✕</button>
        <div className={`st-gen-form${tab === 'advanced' ? ' ad-wide' : ''}`}>
          {tab === 'advanced' ? <PropDrawParts description={prompt} parts={parts} onChange={setParts} testId="add-gen-part" /> : <>
          <p className="st-muted" data-testid="add-gen-hint">{approve ? 'Draw a candidate, then pick it below: it is placed at the marked spot.' : 'It is placed at the marked spot when you pick a candidate from the list.'}</p>
          <label className="st-field">
            <span>Label</span>
            <input className="st-input" value={name} placeholder="Wheelbarrow" data-testid="add-gen-name"
              onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          </label>
          <label className="st-field">
            <span>Describe it</span>
            <textarea className="st-input" rows={6} value={desc} spellCheck={false}
              placeholder="An old wooden wheelbarrow with a rusted wheel and a coil of rope in the tray…"
              data-testid="add-gen-desc" onChange={(e) => setDesc(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          </label>
          {upload && (
            <p className="st-muted" data-testid="add-gen-upload-line">
              or <label className="st-gen-upload">upload a photo<input type="file" accept="image/*" hidden data-testid="add-gen-upload"
                onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} /></label> · used as is, no credits
            </p>
          )}
          <PromptWarnings warnings={warnings} testId="add-gen-warnings" />
          {edited && <p className="st-muted" data-testid="add-gen-edited-note">Some parts of the draw are edited under ADVANCED.</p>}
          </>}
          {busy && !looks.length
            ? <RunPill label="Drawing candidates…" estimate={STILL_ESTIMATE} price={price(count)} testId="add-gen-pill" />
            : !looks.length && <span className="sd-genline">
              <PriceButton primary verb={`Draw ${count} ${count === 1 ? 'candidate' : 'candidates'}`} price={price(count)} disabled={!prompt || !!placing} title={prompt ? undefined : 'Describe it first'}
                onClick={() => void start(count)} testId="add-gen-draw" />
              <GenCount value={count} onChange={setCount} testId="add-gen-count" min={1} max={4} />
            </span>}
          {prompt && tab === 'describe' && <SentLine testId="add-gen-sent" text={conceptPrompt('prop', { description: prompt, parts })} />}
          <AddGenPicks looks={looks} start={initial?.sel} buildPrice={buildPrice} againPrice={price(1)} busy={busy || placing !== null} placing={placing}
            drawing={busy && looks.length > 0} onUse={(f) => void use(f)} onAgain={() => void start(1)} noWords={!prompt} />
          <button type="button" className="st-btn" data-testid="add-gen-cancel" disabled={!!placing} onClick={onClose}>Cancel</button>
          {done && <p className="st-muted" data-testid="add-gen-done">{done}</p>}
          {error && <p className="st-warn" role="alert" data-testid="add-gen-error">{error}</p>}
        </div>
      </div>
      {tab === 'describe' && <div className="st-viewer-info">
        <h3>How this works</h3>
        <p className="st-muted">You describe it once. The candidates appear here: Use this one places it at the marked spot; the others stay in the list as alternates.</p>
        <p className="st-muted" data-testid="add-gen-build-line">The one you pick becomes a prop of the scene and builds itself in 3D: one Cloud job, about a minute{typeof buildPrice === 'number' ? `, about ${Math.round(buildPrice)} cr` : ''}. A labelled stand-in holds its place until then.</p>
        <p className="st-muted">This is a paid draw: the price on the button follows the count, and the words above are what go, as written.</p>
      </div>}
    </div>
  )
}
