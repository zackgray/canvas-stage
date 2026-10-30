import type { PassCandidate } from '../../shared/passContract'
import { NO_COMFY_TARGET, type L2RRender } from '../../shared/shotContract'
import { KeepDiscard } from '../passes/KeepDiscard'
import { usePassCandidates } from '../passes/usePassCandidates'
import { PriceButton } from '../ui'
import { useFacePass } from './FacePassApi'
import type { FacePersonView } from './FacePassTypes'
import { refresh as refreshRender } from './l2rStore'

const TIP = 'Re-renders a close window around this face from their cast card (about 4x the head, the render\'s own motion as the guide) and pastes it back into every frame. Lands as a candidate: before beside after at 100 %.'

/** the candidates of this person on this render worth showing: every live one, and the last one kept */
function theirs(all: PassCandidate[], renderId: string, subject: string): PassCandidate[] {
  const mine = all.filter((c) => c.pass === 'facePass' && c.target.kind === 'render' && c.target.renderId === renderId && c.subject === subject)
  const keptOne = mine.find((c) => c.state === 'kept')
  return mine.filter((c) => c.state === 'running' || c.state === 'candidate' || c.state === 'failed' || c === keptOne)
}

function Strip({ p, busy, onTrack }: { p: FacePersonView; busy: boolean; onTrack: () => void }) {
  const t = p.track
  if (t?.ok && t.strip) {
    const frames = (t.frames ?? []).map((f, i, a) => (i === a.length - 1 ? 'last' : String(f))).join(' · ')
    return <img className="st-l2r-face-strip" src={t.strip} alt={`${p.name} at frames ${frames}`} title={`Their face in the render at frames ${frames}`} data-testid={`face-strip-${p.subject}`} />
  }
  if (t && !t.ok) return <span className="st-warn" data-testid={`face-lost-${p.subject}`}>{t.why ?? 'The face could not be followed through the shot.'}</span>
  return <PriceButton verb="Show their face" price={0} disabled={busy} onClick={onTrack} testId={`face-track-${p.subject}`}
    title="Free: follows their head through the render and shows it at a few frames" />
}

/**
 * The face detail pass in the Render step (recipe step 6): per staged person on the finished render, a strip of their face across the
 * shot and "Fix this face" with its price; the result is a candidate (KeepDiscard) and Keep makes it the render's finished cut.
 */
export function FacePassRow({ render, takeId }: { render: L2RRender | null; takeId: string | null | undefined }) {
  const on = render?.status === 'done' && !!render.finished ? render : null
  const face = useFacePass(on?.id)
  const passes = usePassCandidates(on ? takeId : null)
  const st = face.status
  if (!on || !st || !st.people.length) return null
  const keep = async (id: string) => { await passes.keep(id); await refreshRender(); await face.refresh() }
  return (
    <div className="st-l2r-faces" data-testid="face-pass">
      <h4>Face detail</h4>
      {st.people.map((p) => {
        const cands = theirs(passes.candidates, on.id, p.subject)
        const running = cands.some((c) => c.state === 'running') || face.busy.has(p.subject)
        const why = p.why ?? (!st.configured ? NO_COMFY_TARGET : st.running ? 'A face pass is running.' : running ? 'This face is being fixed.' : null)
        return (
          <div className="st-l2r-face" key={p.subject} data-testid={`face-${p.subject}`}>
            <div className="st-l2r-row">
              <span title={p.headPx !== null ? `Head about ${p.headPx} px tall at its largest` : undefined}>{p.name}{p.small ? ' · small in frame' : ''}</span>
              <Strip p={p} busy={face.busy.has(p.subject)} onTrack={() => void face.track(p.subject)} />
              <PriceButton verb="Fix this face" price={st.price} disabled={!!why} title={why ?? TIP} testId={`face-fix-${p.subject}`}
                onClick={() => { void face.fix(p.subject).then(() => passes.refresh()) }} />
            </div>
            {p.why && <p className="st-muted" data-testid={`face-why-${p.subject}`}>{p.why}</p>}
            {cands.map((c) => (
              <KeepDiscard key={c.id} candidate={c} busy={passes.busy.has(c.id)} onKeep={() => void keep(c.id)} onDiscard={() => void passes.discard(c.id)} onRecover={() => void passes.recover(c.id)} />
            ))}
          </div>
        )
      })}
      {(face.error || passes.error) && <p className="st-warn" data-testid="face-error">{face.error ?? passes.error}</p>}
    </div>
  )
}
