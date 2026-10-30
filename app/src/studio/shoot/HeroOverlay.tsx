import { useEffect, useRef, useState } from 'react'
import { LAYOUT_WARNING } from '../../../server/hero/kitSpec'
import { shotPaths, type L2RRender } from '../../shared/shotContract'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { Seg } from '../Seg'
import { useHeroPublished } from './heroPublished'
import { PENDING_FRAME, setFrameView, showFrameClip, useClipAsk, useFrameView } from './firstFrameView'
import { useCurrentTakeId } from './currentTake'
import { DrawPress } from '../stage/DrawPress'
import { FrameEditDock } from '../stage/FrameEditDock'
import { useFrameEditPublished } from '../stage/frameEditStore'
import type { FrameEditModel } from '../stage/useFrameEdit'
import { useStageRender } from '../stage/useStageRender'
import './overlay.css'

/** the window's picture: the drawn version, the clay picture the draw was made from, or the take's finished clip (same size and place) */
export type FramePicture = 'clay' | 'still' | 'clip'

/** the clay picture of a take's first frame: the clay export's frame 0, which the draw takes as its input (clay-f0.png) */
export const clayPictureOf = (takeId: string, version: string) => `/${shotPaths(takeId).clay}/clay-f0.png?v=${encodeURIComponent(version)}`

const createdOf = (x: { createdAt?: string } | null | undefined) => (x?.createdAt ? Date.parse(x.createdAt) || 0 : 0)
/** (owner 10-29) the clip is what the window opens on once the take's render is the newest thing: rendered from the version in use,
 *  or after it was made; an edit or another version picked since then opens on the still */
export function clipFirst(clip: L2RRender | null, edit: FrameEditModel | null): boolean {
  if (!clip) return false
  const inUse = edit?.inUse ?? null
  return !inUse || clip.stillId === inUse.id || createdOf(clip as { createdAt?: string }) > createdOf(inUse)
}

/**
 * The first-frame window over the viewport (owner 10-29): the one place for the look and the render. It opens from the take card's
 * first-frame thumbnail, or when a draw lands; the first frame's draw opens it at once in its working state (PENDING_FRAME: the
 * frames update, then the draw) until the frame lands. The X at the top right and Esc close it (Esc while typing only leaves the
 * box). Clay | Still | Clip swaps the picture, at the same size and place: the clay picture the draw was made from, the version on
 * show, or the take's finished clip (looped, muted, with controls). Clip is the default once the take's render is the newest thing
 * and again whenever a render finishes; picking a version or an edit landing turns it back to Still. Beside the picture: Edit this
 * frame, the version strip (one click = the frame in use), Draw another and Render clip (FrameEditDock). Reads what the still block
 * publishes; nothing here holds hero state or spends.
 */
export function HeroOverlay({ lab }: { lab?: ProjectionLabState }) {
  // a lab without the set's source (a bare viewport) has no render to read: the window without a clip
  return lab?.s ? <WithClip lab={lab} /> : <Window lab={lab} clip={null} rendering={false} />
}

function WithClip({ lab }: { lab: ProjectionLabState }) {
  const r = useStageRender(lab)
  return <Window lab={lab} clip={r.clip} rendering={r.running} />
}

function Window({ lab, clip, rendering }: { lab?: ProjectionLabState; clip: L2RRender | null; rendering: boolean }) {
  const o = useHeroPublished()?.overlay ?? null
  const view = useFrameView(o?.still ?? null, !!o?.approved)
  const pending = useFrameView({ id: PENDING_FRAME }) === 'still'
  const shown = !!o && view === 'still'
  const edit = useFrameEditPublished()
  const mine = edit?.takeId ? edit : null
  const picture = usePicture(shown, clip, mine, rendering, () => { if (o) showFrameClip(o.still.id) })
  const open = shown || pending
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) { t.blur(); return }
      setFrameView(shown && o ? o.still.id : PENDING_FRAME, '3d')
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open, shown, o])
  if (!shown && pending) return <PendingWindow lab={lab} />
  if (!o || !shown) return null
  const { still } = o
  const pic = mine?.shown ?? null
  const onShow = pic ?? still
  const view2 = picture.value === 'clip' && !clip ? 'still' : picture.value
  const layoutOff = view2 === 'still' && !pic && !!still.layout && !still.layout.ok
  return (
    <section className="st-hero-overlay" data-testid="hero-overlay" aria-label="The first frame">
      <div className="st-hero-overlay-head">
        <Seg label="Picture" small value={view2} testId="frame-picture" onChange={picture.set}
          items={[{ id: 'clay', label: 'Clay', title: 'The 3D set picture this first frame was drawn from, at the same size and place' }, { id: 'still', label: 'Still', title: 'The drawn first frame' },
            ...(clip ? [{ id: 'clip' as const, label: 'Clip', title: 'The finished clip of this take, at the same size and place' }] : [])]} />
        <button type="button" className="st-btn st-hero-overlay-close" data-testid="hero-overlay-close" aria-label="Close" title="Back to the camera view (Esc). Your edit words stay."
          onClick={() => setFrameView(still.id, '3d')}>×</button>
      </div>
      <div className="st-hero-overlay-body">
        <div className="st-hero-overlay-pic">
          {view2 === 'clip' && clip
            ? <video key={clip.id} className="st-hero-overlay-img" data-testid="hero-overlay-clip" src={clip.finished ?? clip.raw ?? undefined} loop muted autoPlay controls playsInline />
            : <img className="st-hero-overlay-img" src={view2 === 'clay' ? clayPictureOf(still.takeId, onShow.id) : onShow.png} data-testid="hero-overlay-img"
              alt={view2 === 'clay' ? 'The clay picture the first frame was drawn from' : 'The first frame of the video'} />}
          {layoutOff && <p className="st-warn" data-testid="hero-overlay-layout">{LAYOUT_WARNING}</p>}
        </div>
        {mine && <FrameEditDock model={mine} frameId={still.id} onScreen={onShow.id} lab={lab} onStill={() => picture.set('still')} onClip={clip ? () => picture.set('clip') : undefined} />}
      </div>
    </section>
  )
}

/** which picture shows: the default on opening (the clip once the render is the newest thing), the clip when a render finishes, the
 *  still when a version is picked or an edit lands; the owner's own switch otherwise */
function usePicture(open: boolean, clip: L2RRender | null, edit: FrameEditModel | null, rendering: boolean, onLanded: () => void) {
  const ask = useClipAsk()
  const [value, set] = useState<FramePicture>(() => (clipFirst(clip, edit) ? 'clip' : 'still'))
  const clipId = clip?.id ?? null, shownId = edit?.shown?.id ?? null
  const seen = useRef({ ask, open, clip: clipId, shown: shownId, rendering })
  useEffect(() => {
    const was = seen.current
    // a render that finished: seen running, now done with a clip (also one whose new clip is read a moment after the run ends)
    const landed = !rendering && !!clipId && (was.rendering || (clipId !== was.clip && was.clip !== null))
    seen.current = { ask, open, clip: clipId, shown: shownId, rendering: rendering || (was.rendering && !clipId) }
    if (open && !was.open) set(clipFirst(clip, edit) ? 'clip' : 'still') // opened: the newest thing
    else if (landed) { set('clip'); if (!open) onLanded() } // a render finished: show it (a closed window opens on it)
    else if (ask !== was.ask) set('clip') // the take card's Clip thumbnail
    else if (shownId !== was.shown && shownId) set('still') // a version picked or an edit landed: what will render
  }, [open, clipId, shownId, rendering, ask]) // eslint-disable-line react-hooks/exhaustive-deps -- reads the clip and edit of this render
  return { value, set }
}

/** the window while the first frame's draw prepares and draws: the clay picture (once the frames exist), the running pill */
function PendingWindow({ lab }: { lab?: ProjectionLabState }) {
  const takeId = useCurrentTakeId()
  const [noClay, setNoClay] = useState(false)
  const [v] = useState(() => String(Date.now()))
  return (
    <section className="st-hero-overlay" data-testid="hero-overlay-pending" aria-label="The first frame, being drawn">
      <div className="st-hero-overlay-head">
        <span className="st-muted">The first frame</span>
        <button type="button" className="st-btn st-hero-overlay-close" data-testid="hero-overlay-close" aria-label="Close" title="Back to the camera view (Esc). The draw goes on."
          onClick={() => setFrameView(PENDING_FRAME, '3d')}>×</button>
      </div>
      <div className="st-hero-overlay-body">
        <div className="st-hero-overlay-pic">
          {takeId && !noClay ? <img className="st-hero-overlay-img st-hero-overlay-wait" src={clayPictureOf(takeId, v)} alt="The clay picture the first frame is drawn from" onError={() => setNoClay(true)} />
            : <div className="st-hero-overlay-img" />}
        </div>
        <div className="st-hero-overlay-edit" data-testid="frame-pending-dock">
          {lab ? <DrawPress verb="Draw the first frame" primary building={false} worldId={lab.kit?.id ?? null} pop nudge={false} /> : <p className="st-muted">The first frame is being drawn…</p>}
        </div>
      </div>
    </section>
  )
}
