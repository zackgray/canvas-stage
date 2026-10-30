import { currentSceneId } from '../../library/currentScene'
import { recordExport } from '../../library/sceneExports'
import { pick, type L2RState } from '../render/l2rStore'
import { SHOT_STATE_WORDS, takeLength } from '../render/ShotsList'
import { useShots } from '../render/useShots'
import '../render/shots.css'
import { displayName } from '../names'
import { RowHead } from '../Seg'

/**
 * Export's other shots: every take of the scene's set, besides the one picked, that has a render back, each with its own
 * Download (free; the file is on disk) and Show here (the one take pick Render reads too). None = nothing shown.
 */
export function OtherShots({ s }: { s: L2RState }) {
  const rows = useShots(s).filter((r) => r.takeId !== s.takeId && r.video)
  if (!rows.length) return null
  return (
    <div className="st-shots" data-testid="export-other-shots">
      <RowHead title="Other shots of this scene" hint={String(rows.length)} />
      <ul className="st-shot-list">
        {rows.map((r) => (
          <li key={r.takeId} className="st-shot" data-testid={`export-other-${r.takeId}`}>
            {r.thumb ? <img className="st-shot-thumb" src={r.thumb} alt="" loading="lazy" /> : <video className="st-shot-thumb" src={`${r.video}#t=0.5`} muted playsInline preload="metadata" />}
            <span className="st-shot-text">
              <b>{displayName(r.takeId)}</b>
              <span className="st-muted">{takeLength(r)} · {SHOT_STATE_WORDS[r.finished ? 'finished' : 'raw']}</span>
            </span>
            <button type="button" className="st-btn sc-small" data-testid={`export-other-show-${r.takeId}`} onClick={() => pick(r.takeId)}>Show here</button>
            <a className="st-btn sc-small" href={r.video!} download={`${r.takeId}.mp4`} data-testid={`export-other-download-${r.takeId}`}
              onClick={() => recordExport(currentSceneId(), { takeId: r.takeId, url: r.video!, finished: r.finished })}>Download</a>
          </li>
        ))}
      </ul>
    </div>
  )
}
