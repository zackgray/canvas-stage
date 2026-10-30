import { useCurrentScene } from '../../library/currentScene'
import { useSceneExports } from '../../library/sceneExports'
import { CutPreview } from '../../labs/projection/cut/CutPreview'
import { CutTimeline } from '../../labs/projection/cut/CutTimeline'
import { moveCut, type CutController, type CutTake } from '../../labs/projection/cut'
import '../../labs/projection/cut/cut.css'
import { displayName, stampOf } from '../names'
import { RowHead } from '../Seg'
import { Advanced, PriceButton, Progress, Select } from '../ui'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { RoughCut, takeLabel } from './RoughCut'
import { TakeShot, useTakeShot } from './TakeShot'
import { OtherShots } from './OtherShots'
import { useExportCut } from './useExportCut'

/** nothing of this scene's to export: what to do, in order */
export const EMPTY = 'Nothing to export for this scene yet. Film and lock a take on the Stage, render it on Render, and the finished shot appears here.'

/** The legacy timeline labels its rows from `warpFolder.slice(5)`; hand it the name behind a 5-character stand-in for the "warp-" prefix. */
const named = (takes: CutTake[]): CutTake[] => takes.map((t) => ({ ...t, warpFolder: `warp-${displayName(t.warpFolder)}` }))
const exportName = (id: string) => `Cut · ${stampOf(id) ?? displayName(id)}`

/**
 * Export: the scene's shots out of the app (an editor outside cuts them, L7). Only the world on the set: the take picked on
 * Render, named, and its finished render (a file to download), then the scene's other rendered takes each with their own
 * Download. The classic renders of a performance pack laid on the shared clock (one press exporting them with the pack's audio,
 * free, local ffmpeg; the rough cut under Advanced) show only when the set has such a pack: takes made in the app have none.
 * The Exported list shows only once something was exported. `lab` absent = the old unscoped listing (tests).
 */
export function ExportScreen({ cut, lab }: { cut: CutController; lab?: ProjectionLabState }) {
  const x = useExportCut(cut, lab ? lab.performance.layer?.pack?.id ?? null : undefined)
  const { pack, takes, segs } = x
  const shot = useTakeShot(lab?.s.source)
  // the last export job, only when it was this performance's (the server keeps the newest job of any scene)
  const done = cut.status?.state === 'done' && (lab === undefined || (!!pack && cut.status.packId === pack.packId)) ? cut.status : null
  // only this performance's cuts: with none on the set there are none (a cut with no pack id once matched a missing pack)
  const exports = pack ? (cut.data?.cuts ?? []).filter((c) => c.packId === pack.packId).reverse() : []
  // the shots this scene's owner has downloaded from here (the take's finished render): exports of this scene, whichever performance is on the set
  const downloads = useSceneExports(useCurrentScene().id).filter((d) => d.url !== done?.output)
  // nothing exported yet: no "Exported 0" heading (review F6)
  const count = exports.length + downloads.length + (done ? 1 : 0)
  const silent = segs.filter((s) => !takes.find((t) => t.id === s.takeId)?.hasAudio).length
  return (
    <div className="st-two" data-testid="page-export">
      <section className="st-pane st-controls">
        <h1>Export</h1>
        {!cut.loaded && <p className="st-muted">Looking for renders…</p>}
        {cut.loaded && !cut.data && <p className="st-muted" data-testid="cut-offline">The export service is not running (dev server only).</p>}
        {cut.data && cut.data.ffmpeg === false && <p className="st-warn" data-testid="cut-no-ffmpeg">ffmpeg is not installed or not on PATH; install it and restart the dev server to export.</p>}
        <TakeShot shot={shot} />
        {shot.state && <OtherShots s={shot.state} />}
        {cut.data && x.performances.length === 0 && !shot.takeId && <p className="st-muted" data-testid="cut-empty">{EMPTY}</p>}
        {pack && (
          <>
            <Select label="Performance" value={pack.packId} onChange={x.setPackId} testId="cut-pack"
              options={x.performances.map((p) => ({ value: p.packId, label: `${displayName(p.packId)} · ${p.takes.length} renders` }))} />
            <RowHead title="Shots" hint={`${takes.length} renders on the shared clock`} />
            <ul className="st-takes" data-testid="export-shots">
              {takes.map((t) => <li key={t.id} className={segs.some((s) => s.takeId === t.id) ? 'st-take-on' : undefined}>{takeLabel(t)}</li>)}
            </ul>
            <div className="st-actions">
              <PriceButton primary verb={cut.running ? 'Exporting…' : 'Export'} price="free · with performance audio" disabled={!x.canExport} onClick={x.start} testId="cut-export" />
            </div>
            {silent > 0 && <p className="st-muted">{silent} segment{silent > 1 ? 's' : ''} from renders with no audio will be silent.</p>}
            {cut.status?.state === 'running' && <Progress label="exporting" />}
            {cut.error && <p className="st-warn" data-testid="cut-refused">{cut.error}</p>}
            {(cut.status?.state === 'error' || cut.status?.state === 'interrupted') && <p className="st-warn" data-testid="cut-failed">Export failed: {cut.status.error}</p>}
            <Advanced stage="export" label="Rough cut">
              <RoughCut x={x} />
            </Advanced>
          </>
        )}
      </section>
      <section className="st-pane st-result">
        {pack && segs.length > 0 && (
          <>
            <div className="st-hero"><CutPreview takes={takes} segs={segs} playhead={x.playhead} setPlayhead={x.setPlayhead} /></div>
            <CutTimeline takes={named(takes)} segs={segs} playhead={x.playhead} onMove={(i, f) => x.setSegs((s) => moveCut(s, i, f))} onSeek={x.setPlayhead} />
          </>
        )}
        {count > 0 && <RowHead title="Exported" hint={String(count)} />}
        {count > 0 && <div className="st-thumbs" data-testid="cut-out">
          {done?.output && <figure><video src={done.output} controls playsInline data-testid="cut-result" /><figcaption>{exportName(done.id ?? '')}</figcaption></figure>}
          {exports.filter((c) => c.url !== done?.output).map((c) => (
            <figure key={c.id}><video src={c.url} controls playsInline preload="metadata" /><figcaption>{exportName(c.id)} · {c.segments} segments</figcaption></figure>
          ))}
          {downloads.map((d) => (
            <figure key={`${d.takeId}|${d.url}`} data-testid="export-downloaded">
              <video src={d.url} controls muted playsInline preload="metadata" />
              <figcaption>{displayName(d.takeId)} · {d.finished ? 'finished shot' : 'raw render'} · downloaded {new Date(d.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</figcaption>
            </figure>
          ))}
        </div>}
      </section>
    </div>
  )
}
