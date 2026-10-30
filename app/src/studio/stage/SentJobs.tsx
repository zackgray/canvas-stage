// "What will be sent" at the Stage's two paid presses (owner 10-29: the user's words go through untouched and the app adds nothing
// silently): every job the press sends, in order, with its exact words and its negative, as the server's own composer builds them
// (the draw's press preview, server/hero/preview.ts `sent`; the render's status prompt, server/l2r/compose.ts). Muted, like the
// person and prop cards' line (SentLine.tsx). (owner 10-29, later) A job with a key is editable: its box holds the composed words,
// and what the owner types there is sent exactly as written, for this take until Reset (sentEdits.ts). The edit changes only text.
// `useRenderSent` reads the render's.
import { useEffect, useState } from 'react'
import { DRAW_ADD_LABELS, type AppAddition, type SentJob } from '../../shared/stillPressContract'
import type { L2RHook } from '../render/l2rModel'
import { editOlder, keepSentEdit, resetSentEdit, setSentEdit, useSentEdits, type SentKey } from './sentEdits'
import { setDrawAdd } from './drawAddSwitches'

/** the render's one job: what Render clip sends now (an override as the server expands it, else the default prompt) */
export const RENDER_JOB = 'The render (LTX-2.5 with Layout-To-Render), over the clay video and this first frame'
/** after the render, nothing paid and no words: said so the list is the whole story */
export const RENDER_AFTER = 'Then the finish runs on this machine, free, with no words.'
export const EDITED_LINE = 'Edited · sent as written.'
export const OLDER_LINE = "Your edited text is older than the take's words:"
export const ADDED_LINE = 'Added by the app'

/** (prompt-fix pass) one "Added by the app" line: what it adds and, for a take, its switch (off = the server leaves the words out) */
function AddedLine({ a, takeId, testId }: { a: AppAddition; takeId: string | null; testId: string }) {
  return (
    <p className={`st-muted st-sent-line st-sent-added${a.on ? '' : ' st-sent-added-off'}`} data-testid={testId}>
      {ADDED_LINE} · {DRAW_ADD_LABELS[a.key]}: <span style={a.on ? undefined : { textDecoration: 'line-through' }}>{a.text}</span>{' '}
      {takeId && (
        <label className="st-sent-switch"><input type="checkbox" data-testid={`${testId}-switch`} checked={a.on} onChange={(ev) => setDrawAdd(takeId, a.key, ev.target.checked)} />
          {a.on ? ' On' : ' Off'}</label>
      )}
    </p>
  )
}

/** `takeId` + a job's `key`: its words are editable for that take (null key = shown only) */
export function SentJobs({ jobs, testId, after, takeId = null, keys }: { jobs: SentJob[] | null | undefined; testId: string; after?: string
  takeId?: string | null; keys?: readonly (SentKey | null | undefined)[] }) {
  const edits = useSentEdits(takeId)
  if (!jobs?.length) return <p className="st-muted st-sent-line" data-testid={testId}>What will be sent: reading it…</p>
  return (
    <div className="st-sent" data-testid={testId}>
      {jobs.map((j, i) => {
        const key = takeId ? keys?.[i] ?? null : null
        const e = key ? edits[key] : undefined
        const composed = j.composed ?? j.prompt
        return (
          <div key={i} className="st-sent-job" data-testid={`${testId}-${i}`}>
            <span className="st-muted st-sent-what">{i === 0 ? `What will be sent · ${j.what}` : j.what}:</span>
            {key && takeId ? (
              <textarea className="st-sent-box" data-testid={`${testId}-${i}-text`} rows={5} spellCheck={false} aria-label={`${j.what}: the words sent`}
                value={e ? e.text : composed} onChange={(ev) => setSentEdit(takeId, key, ev.target.value, composed)} />
            ) : <p className="st-muted st-sent-line">{j.prompt.trim() || '(no words)'}</p>}
            {key && takeId && e && (
              <p className="st-muted st-sent-line" data-testid={`${testId}-${i}-edited`}>{EDITED_LINE}{' '}
                <button type="button" className="st-link" data-testid={`${testId}-${i}-reset`} title="Back to the words the app composed"
                  onClick={() => resetSentEdit(takeId, key)}>Reset</button></p>
            )}
            {key && takeId && editOlder(e, j.composed ?? null) && (
              <p className="st-warn st-sent-line" data-testid={`${testId}-${i}-older`}>{OLDER_LINE}{' '}
                <button type="button" className="st-link" data-testid={`${testId}-${i}-older-reset`} onClick={() => resetSentEdit(takeId, key)}>Reset</button>{' / '}
                <button type="button" className="st-link" data-testid={`${testId}-${i}-keep`} onClick={() => keepSentEdit(takeId, key, j.composed!)}>Keep</button></p>
            )}
            {j.added?.map((a) => <AddedLine key={a.key} a={a} takeId={takeId} testId={`${testId}-${i}-added-${a.key}`} />)}
            {j.negative !== undefined && <p className="st-muted st-sent-line st-sent-neg" data-testid={`${testId}-${i}-neg`}>Negative: {j.negative.trim() || 'none'}.</p>}
            {j.negativeEnglish && <p className="st-muted st-sent-line st-sent-neg" data-testid={`${testId}-${i}-neg-en`}>In English: {j.negativeEnglish}.{j.negativeSource ? ` (${j.negativeSource}.)` : ''}</p>}
          </div>
        )
      })}
      {after && <p className="st-muted st-sent-line">{after}</p>}
    </div>
  )
}

/** the render's sent jobs: the status's default prompt (its `composed`), or an override as the server expands it */
export function useRenderSent(l: Pick<L2RHook, 'state' | 'previewPrompt'>): SentJob[] | null {
  const override = l.state.prompt.trim()
  const base = l.state.status?.prompt ?? null
  const [seen, setSeen] = useState<{ text: string; sent: string } | null>(null)
  const { previewPrompt } = l
  useEffect(() => {
    if (!override) return
    let live = true
    void previewPrompt(override).then((x) => { if (live && x) setSeen({ text: override, sent: x.text }) })
    return () => { live = false }
  }, [override, previewPrompt])
  // while the override's expansion is read, its own text stands (the box being typed in never drops out from under the cursor)
  const prompt = override ? (seen?.text === override ? seen.sent : override) : base
  return prompt === null ? null : [{ what: RENDER_JOB, prompt, negative: '', ...(base !== null ? { composed: base } : {}) }]
}
