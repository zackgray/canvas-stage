// One editable part of a paid draw's prompt (prop-draw-parts, owner 2026-10-29: "the character works great, apply it to the
// props"): the ONE box the person card's ADVANCED tab and the props' (the Add dialog and the prop card) are built from, so they
// cannot drift. It shows the app's real default until edited; an edit is held as typed (an edit equal to the default is no edit),
// clearing really clears (the part is then left out), an 'Edited' mark says it differs, and Reset puts the default back.
import type { ReactNode } from 'react'

export interface PromptBoxProps {
  label: string
  /** the edited text; undefined = the default */
  value: string | undefined
  /** the app's default for this part, as it is sent */
  def: string
  onChange: (v: string | undefined) => void
  hint?: ReactNode
  rows?: number
  /** the testids: `${testId}` the box, `${testId}-reset` its Reset, `${testId}-edited` its mark */
  testId: string
  /** a quiet press under the box (e.g. the props' 'Add no logos, no printed text') */
  extra?: ReactNode
}

export function PromptBox({ label, value, def, onChange, hint, rows = 3, testId, extra }: PromptBoxProps) {
  const edited = value !== undefined
  return (
    <div className="oc-field">
      <label htmlFor={testId}>{label}{edited && <span className="oc-edited" data-testid={`${testId}-edited`}> · Edited</span>}</label>
      <div className="oc-box">
        <textarea id={testId} rows={rows} value={value ?? def} spellCheck={false} data-testid={testId}
          onChange={(e) => onChange(e.target.value === def ? undefined : e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      </div>
      {hint && <span className="st-field-hint">{hint}</span>}
      <span>
        <button type="button" className="st-btn" disabled={!edited} data-testid={`${testId}-reset`} onClick={() => onChange(undefined)}>Reset</button>
        {extra}
      </span>
    </div>
  )
}
