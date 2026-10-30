// One Guided word stage (Location, Light & mood, Story beats): describe, Continue. Nothing is drawn here: the words go into the
// brief the planner and every later prompt read. The last stage's button is the build itself (`build`). Also the parts the piece
// stages share: the generate-count stepper, the priced Generate line (the stepper sits right beside the press, one compact line),
// the queue note under a step's title, a candidate tile, the drawing shims.
import type { ReactNode } from 'react'
import { WAITING } from '../../jobs/sceneJobs'
import { Elapsed, PriceButton } from '../ui'
import type { Guided } from './design/guided'
import { GEN_MAX, GEN_MIN, type StageDef, type WordStageId } from './design/guidedStages'
import { Img } from './parts'
import type { SceneCtx } from './sceneCtx'

/** how many options one Generate press draws on the Cast and Props steps: a small stepper, kept inside the bounds (the Cast step
 *  passes a higher floor: people and creatures draw in pairs) */
export function GenCount({ value, onChange, testId, min = GEN_MIN, max = GEN_MAX }: { value: number; onChange: (n: number) => void; testId: string; min?: number; max?: number }) {
  const step = (d: number) => onChange(Math.min(max, Math.max(min, value + d)))
  return (
    <span className="sd-gcn" data-testid={testId}>
      <span className="sd-gcl">Options each time</span>
      <button type="button" aria-label="Fewer" className="sd-gcb" disabled={value <= min} onClick={() => step(-1)} data-testid={`${testId}-less`}>−</button>
      <b>{value}</b>
      <button type="button" aria-label="More" className="sd-gcb" disabled={value >= max} onClick={() => step(1)} data-testid={`${testId}-more`}>+</button>
    </span>
  )
}

/**
 * One compact line for a piece card: the priced Generate press with the "Options each time" stepper right beside it (the stepper
 * sets the next press's count; the price shown is that count's) and the elapsed time of a running draw. The Cast and Props steps
 * share this markup.
 */
export function GenLine({ verb, price, disabled, title, onGen, genTestId, count, onCount, countTestId, min, since }: {
  verb: string; price: number; disabled: boolean; title: string; onGen: () => void; genTestId: string
  count: number; onCount: (n: number) => void; countTestId: string; min?: number; since?: number
}) {
  return (
    <span className="sd-genline" data-testid={`${genTestId}-line`}>
      <PriceButton verb={verb} price={price} disabled={disabled} onClick={onGen} testId={genTestId} title={title} />
      <GenCount value={count} onChange={onCount} testId={countTestId} min={min} />
      {since ? <Elapsed since={since} /> : null}
    </span>
  )
}

/** under a piece step's title: this scene's job is queued behind another and starts by itself; nothing is spent until it starts */
export function QueueLine({ show }: { show: boolean }) {
  if (!show) return null
  return <p className="sd-msub" data-testid="queue-note">{WAITING}</p>
}

/**
 * A candidate tile: picking toggles only this one (keys are stable, so the other images are never rebuilt). `onView` adds a corner
 * button that opens the whole picture (the tile crops it: a cast card's full body is only seen there).
 */
export function Cand({ url, on, onPick, onView, testId }: { url: string; on: boolean; onPick: () => void; onView?: () => void; testId: string }) {
  return (
    <span className="sd-cdw">
      <button type="button" className={`sd-dt sd-cd${on ? ' sel' : ''}`} onClick={onPick} aria-pressed={on} data-testid={testId}>
        <span className="sd-imw"><Img src={url} /></span>{on && <span className="sd-ck">✓</span>}{url.startsWith('blob:') && <span className="sd-stt">yours</span>}
      </button>
      {onView && <button type="button" className="sd-vw" onClick={onView} title="See the whole picture" aria-label="See the whole picture" data-testid={`${testId}-view`}>⤢</button>}
    </span>
  )
}
export const Shims = ({ n }: { n: number }) => <>{Array.from({ length: n }, (_, i) => <div key={`s${i}`} className="sd-dt sd-cd"><div className="sd-shim"><i /><span>Drawing</span></div></div>)}</>

interface Props {
  x: SceneCtx; g: Guided; def: StageDef & { id: WordStageId }
  onNext: () => void
  /** the last stage: its button is the build (priced, with its own reason when it cannot run yet) instead of Continue */
  build?: { button: ReactNode; why: string | null }
}

export function GuidedStage({ x, g, def, onNext, build }: Props) {
  const { c } = x
  const st = g.st[def.id]
  const has = !!st.text.trim()
  const ok = has || def.optional
  return (
    <div data-testid={`stage-${def.id}`}>
      <div className="sd-gq"><h2>{def.q}</h2></div>
      <div className="sd-gin">
        <div className="sd-gdes">
          <textarea value={st.text} placeholder={def.ph} spellCheck={false} data-testid={`stage-text-${def.id}`} onChange={(e) => c.patchStage(def.id, { text: e.target.value })} />
        </div>
      </div>
      <div className="sd-gf">
        <span className="sd-cnt" data-testid={`stage-why-${def.id}`}>{build?.why ?? (has ? 'Written' : def.optional ? 'Optional' : 'Describe it')}</span>
        {build ? build.button : (
          <button type="button" className={`st-btn${ok ? ' st-primary' : ''}`} disabled={!ok} onClick={onNext} data-testid={`stage-next-${def.id}`}>Continue →</button>
        )}
      </div>
    </div>
  )
}
