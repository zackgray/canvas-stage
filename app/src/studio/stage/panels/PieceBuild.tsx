// The prop card's build states (object card wave; the mock's PROP BUILD STATES on the existing pieces route — no new server
// routes): not built = one yellow 'Use this one - build in 3D' with the server's price; built = a quiet disabled 'Built ✓' with no
// price, and the 'Built in 3D' badge the caller wears on the source picture; a different picture picked or the words edited after a
// build = one yellow 'Rebuild from this picture' with its price and the line that it replaces the model, a free Model history with
// 'Go back to this model' (a free re-place of that run's mesh, never a new build) and the 'model no longer matches these words'
// note. While a build runs the one press is a clock; a billed build that never landed keeps its free Recover. A click on a picture
// never reaches here — only these priced presses spend.
import { SET_READ_ONLY } from '../../../labs/projection/stage3d/setEditGate'
import { PIECE_ESTIMATE, PriceButton, RunPill } from '../../ui'
import type { PieceTileState } from '../../scene/piecesApi'
import type { PiecesState } from '../../scene/usePieces'
import type { BuiltModel } from './modelHistory'
import { currentModel } from './modelHistory'

export interface PieceBuildProps {
  tag: string
  p: PiecesState
  /** every model built for this prop, newest first (modelHistory.ts) */
  models: readonly BuiltModel[]
  /** the pictures of the prop, to name the picture a model was built from */
  pics: readonly string[]
  /** the picture the prop currently shows */
  picked: string | null
  /** the words the prop currently carries */
  text: string
  /** free: re-place that run's mesh through the existing complete route */
  goBack: (run: string) => Promise<void>
}

/** the prop's one priced press and its build states; null when the pieces route has no tile for this tag */
export function PieceBuild({ tag, p, models, pics, picked, text, goBack }: PieceBuildProps) {
  const d = p.data
  const t: PieceTileState | undefined = d?.tiles.find((x) => x.tag === tag)
  if (!d || !t) return null
  const since = p.busy[tag]
  const working = !!since || t.status === 'building' || t.status === 'landed'
  const placedRun = t.piece?.run ?? null
  const built = !!t.piece || t.status === 'placed'
  const cur = currentModel(models, placedRun)
  const stale = built && !!cur && text !== cur.text
  const diff = built && !!cur && !!picked && picked !== cur.from
  const rebuild = diff || stale
  const picName = (url: string) => {
    const i = pics.indexOf(url)
    return i >= 0 ? `picture ${i + 1}` : 'an earlier picture'
  }
  return (
    <div className="oc-cta" data-testid="piece-build" data-status={since ? 'building' : t.status} style={{ width: '100%' }}>
      {working ? (
        <button type="button" className="st-btn" disabled><span className="oc-spin" />Building in 3D…</button>
      ) : t.recover ? (
        <PriceButton verb="Recover the paid build" price={0} disabled={!!since} onClick={() => void p.recover(t)} testId="piece-build-recover"
          title={`The build was paid (job ${t.recover.jobId}); this fetches it by id, it never builds again`} />
      ) : !built ? (
        <PriceButton verb="Use this one - build in 3D" price={`(about ${Math.round(d.price)} cr)`} disabled={p.pieceBuilding || p.setReadOnly} primary
          onClick={() => void p.build(t)} testId="piece-build-go"
          title={p.setReadOnly ? SET_READ_ONLY : p.pieceBuilding ? 'Another piece is being built' : 'One Cloud job, about a minute. Plain clay, shape only.'} />
      ) : rebuild ? (
        <PriceButton verb="Rebuild from this picture" price={`(about ${Math.round(d.price)} cr)`} disabled={p.pieceBuilding || p.setReadOnly} primary
          onClick={() => void p.build(t)} testId="piece-build-go"
          title={p.setReadOnly ? SET_READ_ONLY : p.pieceBuilding ? 'Another piece is being built' : 'One Cloud job, about a minute. Replaces the current 3D model.'} />
      ) : (
        <button type="button" className="st-btn" disabled data-testid="piece-built">Built ✓</button>
      )}
      {working && (since || t.status === 'building') && <RunPill label="Building the 3D piece" since={since ?? null} estimate={PIECE_ESTIMATE} price={d.price} testId="piece-build-pill" />}
      {stale && !working && <p className="st-warn" role="alert" data-testid="piece-build-stale">The 3D model no longer matches these words.</p>}
      {rebuild && !working && <span className="st-field-hint">This replaces the current 3D model. The old one stays in history so you can go back.</span>}
      {!rebuild && !working && !t.recover && (built
        ? <span className="st-field-hint" data-testid="piece-build-hint">Clicking a picture only shows it bigger. Credits are spent only on a button with a price.</span>
        : <span className="st-field-hint" data-testid="piece-build-hint">The grey stand-in holds its place in the set until the real shape lands (about a minute).</span>)}
      {models.length > 0 && (
        <div className="oc-models" data-testid="piece-models">
          <h5>Model history</h5>
          {models.map((m, i) => (
            <div className="oc-model-row" key={m.run} data-testid={`piece-model-${i}`}>
              <span>Model from <b>{picName(m.from)}</b>{m.run === placedRun ? ' — in the set' : ''}</span>
              {m.run !== placedRun
                ? <button type="button" className="oc-link" data-testid={`piece-model-back-${i}`} onClick={() => void goBack(m.run)}>Go back to this model</button>
                : <span className="st-muted">current</span>}
            </div>
          ))}
          <span className="st-field-hint">Going back is free.</span>
        </div>
      )}
      {!since && p.autoFailed[tag] && <p className="st-warn" role="alert" data-testid="piece-build-auto-error">{p.autoFailed[tag]}</p>}
      {p.error && <p className="st-warn" role="alert" data-testid="piece-build-error">The 3D build did not finish. {p.error}</p>}
    </div>
  )
}
