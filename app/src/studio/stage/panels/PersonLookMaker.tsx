// The person maker — the LOOK tab of the person card (object card wave; the maker left the right panel): one Guided cast card's
// words, the count (one look by default, owner 2026-10-28; the stepper still runs to its limit) and its price, Generate looks (one
// paid job of the scene through the design calls; the one yellow press while nothing is generated, quiet after), the history strip
// of every generation (newest first, arrows, labelled; a click opens the picture large and NEVER spends — only the separate Use
// press picks, free) and Use this look (grey until a candidate is picked, then the one yellow press). The "Rules every look follows"
// box is gone: the long legal text was the user's side, not the app's; only a short "no logos or printed text" line stays, editable
// under ADVANCED. Nothing here spends on its own.
import { useEffect, useState } from 'react'
import { defaultFraming, frontPrompt } from '../../../labs/projection/cast/api'
import { DEFAULT_LOOK_RULES } from '../../scene/briefApi'
import { genCount, type CastCard } from '../../scene/design/guided'
import { GEN_MAX, GEN_MIN_CAST } from '../../scene/design/guidedStages'
import { candidateCredits } from '../../scene/design/model'
import type { SceneCtx } from '../../scene/sceneCtx'
import { Lightbox, PriceButton } from '../../ui'
import { LookImage } from './LookImage'
import { PromptBox } from './PromptBox'
import { SentLine } from './SentLine'

/** the server's own limits (server/cast/prompts.ts), said on the button before anything is sent */
const DESC_MIN = 12, DESC_MAX = 900, BOX_MAX = 1500

/** why Generate looks cannot run yet, in plain words (null = it can) */
export function genBlock(c: CastCard, busy: boolean): string | null {
  const d = c.desc.trim()
  if (busy) return 'Their looks are being drawn.'
  if (!c.name.trim()) return 'Give them a name first.'
  if (d.length < DESC_MIN) return 'Describe them in a sentence or more: build, face, hair, clothes.'
  if (d.length > DESC_MAX) return `Their words are too long: ${DESC_MAX} characters at most.`
  if ((c.rules ?? '').length > BOX_MAX || (c.framing ?? '').length > BOX_MAX) return `A box is too long: ${BOX_MAX} characters at most.`
  return null
}

/** `playsLook`: the look of this card when it plays the subject now (null when it does not) */
interface Props { x: SceneCtx; c: CastCard; onUse: (url: string) => void; using: boolean; playsLook?: string | null }

/** the LOOK tab's maker: words, count, Generate, the history strip, Use this look */
export function PersonLookMaker({ x, c, onUse, using, playsLook = null }: Props) {
  const calls = x.c
  const g = x.s.d.guided
  const n = genCount(g, 'cast')
  const busy = c.busy || !!calls.busy[`cast:${c.id}`]
  const why = genBlock(c, busy)
  const set = (p: Partial<CastCard>) => calls.patchCard(c.id, p)
  // one look by default (owner 2026-10-28): a card that has nothing drawn yet starts its count at 1, not the seeded pair;
  // a card with paid looks keeps the count it last used, and the stepper still runs to the server's limit. The write waits for
  // the scene's own draft to be read: any set before that drops the draft (unsynced) and the card would open on a blank design.
  const count = (v: number) => calls.setG((y) => ({ ...y, counts: { cast: Math.min(GEN_MAX, Math.max(GEN_MIN_CAST, v)), props: genCount(y, 'props') } }))
  useEffect(() => {
    if (!x.s.synced || c.cands.length !== 0 || c.busy || n === 1) return
    count(1)
  }, [c.id, x.s.synced]) // eslint-disable-line react-hooks/exhaustive-deps -- once per card, after the draft is read
  const [at, setAt] = useState<number | null>(null)
  const picked = c.pick !== null ? c.cands[c.pick] ?? null : null
  const inUse = c.fixed?.look ?? null
  // the picked look is the one they play with now (the whole Use this look went through): nothing left to press
  const done = !!picked && picked === playsLook
  const shown = picked ?? inUse ?? c.cands.at(-1) ?? null
  const order = c.cands.map((_, i) => i).reverse() // newest first
  const gen = () => { if (!why) { count(n); calls.genCast(c.id) } }
  return (
    <div data-testid={`look-maker-${c.id}`}>
      <div className="oc-look">
        <div>
          {shown && (
            <>
              <div className="oc-pane">
                {/* (prop-pick-view) the large picture is the one press that opens the viewer; a thumbnail only picks */}
                <button type="button" className="oc-pane-view" aria-label="See it large" title="Click to see it large" data-testid="look-main-view"
                  onClick={() => setAt(Math.max(0, c.cands.indexOf(shown)))}><LookImage src={shown} alt={c.name.trim() || 'Their look'} testId="look-main" /></button>
                <span className="oc-badge ok">{picked ? 'Picked look' : 'Current look'}</span>
              </div>
              <div className="oc-hist-h"><span>All looks so far</span><span className="st-muted">{c.cands.length} · click one to pick it; click the large one to see it bigger</span></div>
              <div className="oc-sw">
                <button type="button" className="oc-arr oc-arr-l" aria-label="Earlier looks" onClick={() => scrollStrip(-1)}>‹</button>
                <div className="oc-strip" data-testid="look-grid">
                  {order.map((i) => (
                    <button key={`${i}:${c.cands[i]}`} type="button"
                      className={`oc-thumb${c.pick === i ? ' on' : ''}`} aria-pressed={c.pick === i}
                      aria-label={`Look ${i + 1}${c.cands[i] === inUse ? ', in use' : ''}`}
                      onClick={() => set({ pick: i })} data-testid={`look-cand-${i}`}>
                      <LookImage src={c.cands[i]} alt={`Look ${i + 1}`} />
                      <span className="oc-lab">{i + 1}</span>
                      {c.cands[i] === inUse && <span className="oc-tick" data-testid={`look-tick-${i}`}>✓</span>}
                    </button>
                  ))}
                  {busy && Array.from({ length: c.asked ?? n }, (_, i) => <span key={`w${i}`} className="oc-thumb oc-imgwait" />)}
                </div>
                <button type="button" className="oc-arr oc-arr-r" aria-label="Later looks" onClick={() => scrollStrip(1)}>›</button>
              </div>
            </>
          )}
        </div>
        <div>
          <div className="oc-field">
            <label htmlFor="look-desc">Who they are</label>
            <div className="oc-box">
              <textarea id="look-desc" rows={5} value={c.desc} placeholder="Build, face, hair, clothes. Plain words are fine." spellCheck={false}
                onChange={(e) => set({ desc: e.target.value })} data-testid="look-desc" />
            </div>
          </div>
          <div className="oc-count" data-testid="look-count">
            <span className="oc-lab-h">Looks to make</span>
            <span className="oc-stepper">
              <button type="button" disabled={n <= GEN_MIN_CAST} onClick={() => count(n - 1)} aria-label="Fewer looks">−</button>
              <output>{n}</output>
              <button type="button" disabled={n >= GEN_MAX} onClick={() => count(n + 1)} aria-label="More looks">+</button>
            </span>
            <span className="st-field-hint">{n === 1 ? 'One look' : `${n} looks`}, about {candidateCredits('person', n)} cr</span>
          </div>
          <div className="oc-cta">
            {busy
              ? <button type="button" className="st-btn" disabled data-testid="look-generate"><span className="oc-spin" />Making looks…</button>
              : <PriceButton verb={c.cands.length ? 'Generate more looks' : 'Generate looks'} price={candidateCredits('person', n)}
                  primary={c.cands.length === 0} disabled={!!why} title={why ?? `${n} ${n === 1 ? 'look' : 'looks'} drawn from their words`}
                  onClick={gen} testId="look-generate" />}
            {why && !busy && <span className="st-field-hint" data-testid="look-why">{why}</span>}
            <button type="button" className={`st-btn${picked && !done ? ' st-primary' : ''}`} disabled={!picked || using || done}
              onClick={() => picked && onUse(picked)} data-testid="look-use"
              title={done ? 'This is the look they play with now' : picked ? 'Free: they join the scene with this look' : 'Pick one of their looks first: click its picture'}>
              {using ? 'Adding them…' : done ? '✓ In use' : 'Use this look'}</button>
            <span className="st-field-hint">{picked ? 'Using a look is free. Pictures never spend credits.' : 'Click a look below to pick it. Pictures never spend credits.'}</span>
            {calls.error && <p className="st-warn" role="alert" data-testid="look-error">{calls.error}</p>}
            {/* (person-prompt-preview) the exact words the next Generate looks sends: the server's own composer, the same inputs */}
            {(c.desc.trim() || c.name.trim()) && (
              <SentLine testId="look-sent" text={frontPrompt(c.desc || c.name, c.rules ?? DEFAULT_LOOK_RULES, c.framing)} />
            )}
          </div>
        </div>
      </div>
      <Lightbox items={c.cands.map((u, i) => ({ src: u, label: `${c.name.trim() || 'Them'} · look ${i + 1}` }))} index={at} onIndex={setAt} onClose={() => setAt(null)}
        aside={at !== null && (
          <span className="oc-lb-aside">
            <button type="button" className={`st-btn${c.cands[at] !== inUse ? ' st-primary' : ''}`} disabled={using || c.cands[at] === inUse}
              data-testid="look-lightbox-use" onClick={() => { const u = c.cands[at]; set({ pick: at }); setAt(null); onUse(u) }}>
              {c.cands[at] === inUse ? '✓ In use' : 'Use this look'}</button>
            <span className="st-field-hint">{c.cands[at] === inUse ? 'This is the look on the stage now.' : 'Free. Nothing is spent by picking a look.'}</span>
          </span>
        )} />
    </div>
  )
}

const scrollStrip = (dir: number) => {
  const el = document.querySelector<HTMLElement>('.oc-strip')
  el?.scrollBy({ left: dir * ((el.querySelector('.oc-thumb')?.clientWidth ?? 64) + 8), behavior: 'smooth' })
}

/** the ADVANCED tab's editable prompt texts: how the picture is taken, and the short line every default look prompt keeps */
export function PersonLookAdvanced({ x, c }: { x: SceneCtx; c: CastCard }) {
  const set = (p: Partial<CastCard>) => x.c.patchCard(c.id, p)
  const rules = c.rules ?? DEFAULT_LOOK_RULES
  const framingDefault = defaultFraming(c.desc, rules)
  // the one PromptBox the props' ADVANCED is built from too (PropDrawParts), and the same 'What will be sent' line
  return (
    <div>
      <PromptBox label="How the picture is taken" value={c.framing} def={framingDefault} rows={6} testId="look-framing"
        onChange={(v) => set({ framing: v })} hint="Used for every picture of this person. Change only if looks come out wrong." />
      <PromptBox label="No logos or printed text" value={c.rules} def={DEFAULT_LOOK_RULES} rows={2} testId="look-rules"
        onChange={(v) => set({ rules: v })} hint="The one line every default look prompt keeps, so invented brand text stays off the clothes. Clear it to drop the line from the prompt." />
      {(c.desc.trim() || c.name.trim()) && <SentLine testId="look-sent-advanced" text={frontPrompt(c.desc || c.name, rules, c.framing)} />}
    </div>
  )
}
