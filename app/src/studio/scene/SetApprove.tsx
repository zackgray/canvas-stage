// The Set step's two phases (guided wave): the Set is approved first (free), then the Look is drawn from it. The server refuses the
// master draw, its preview and the hero-still press on an unapproved set (setApproval.ts); this is the page's half of the same rule.
import type { ReactNode } from 'react'
import type { SceneState } from './useScene'

/** phase 1's last step: approve the set as it stands; a stale approval says why and offers Approve again (free). `whose` (review
 *  F1): a locked take's own set is on show, so the line names the set it approves ("Take 2's set"), never "the set" */
export function ApproveSet({ s, whose }: { s: Pick<SceneState, 'setKnown' | 'busy' | 'running' | 'setState' | 'approveSet'>; whose?: string }) {
  // not read yet (a fresh mount): say nothing rather than a "none" that may be false
  if (!s.setKnown) return <div className="sd-set-approve" data-testid="set-approval" aria-busy="true" />
  const off = s.busy !== null || !!s.running
  const press = (label: string) => (
    <button type="button" className="st-btn st-primary" disabled={off} onClick={() => void s.approveSet()} data-testid="set-approve">{label}</button>
  )
  return (
    <div className="sd-set-approve" data-testid="set-approval">
      {s.setState === 'approved' && <p className="st-muted" data-testid="set-approved">{whose ? `${whose} is approved.` : 'The set is approved.'}</p>}
      {s.setState === 'stale' && (
        <p className="st-warn" role="status" data-testid="set-approval-stale">The set changed since you approved it. {press('Approve the changed set')} <span className="st-muted">Free.</span></p>
      )}
      {s.setState === 'none' && (
        <p className="st-muted" data-testid="set-approval-none">{whose ? `Happy with ${whose}?` : 'Happy with the set as it stands?'} {press(whose ? `Approve ${whose}` : 'Approve the set')} <span className="st-muted">Free. Every still and render is drawn from the approved set, so nothing is spent before this.</span></p>
      )}
    </div>
  )
}

/** the two phases: the Look stays locked behind the Set's approval */
export function SetPhases({ s, set, look }: { s: SceneState; set: ReactNode; look: ReactNode }) {
  return (
    <>
      <section className="sd-phase" data-testid="set-phase-set">
        <h3>1 · The set</h3>
        {set}
        <ApproveSet s={s} />
      </section>
      <section className="sd-phase" data-testid="set-phase-look">
        <h3>2 · The look</h3>
        {s.setState === 'approved' ? look : <p className="st-muted" data-testid="set-look-locked">Approve the set first.</p>}
      </section>
    </>
  )
}
