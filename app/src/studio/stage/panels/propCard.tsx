// The prop card (object card wave): everything about the picked prop lives in this one dialog, the same pattern as the person.
// LOOK: its pictures (the scene tile's looks, else the sheet element's refs — kept per scene, so a click on the prop reopens them),
// the large preview with the Picture | 3D preview toggle (the grey built model turning, disabled before the build), its name and
// words (each edit writes the existing routes: the design tile and the sheet element), 'Generate more pictures' (one paid draft
// draw through the design's candidate route; neutral naming, more pictures for the 3D build) and the build states (PieceBuild.tsx).
// ADVANCED: 'How the picture is taken', kept per set and prepended to the next more-pictures draw. (prop-pick-view, owner 2026-10-29)
// A thumbnail only picks the picture shown large (the one to build from); the large picture opens the viewer. Neither spends; only
// the priced presses do. The box is held in state, so clearing it really clears it (a cleared box sends nothing), a view in the
// prop's words drops the box's own view clause, and the exact text the draw sends is shown before the press. (prop-draw-parts) The
// ADVANCED boxes are the person card's own, one per part a prop draw adds (PropDrawParts), the same as the Add dialog's.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { jobFetch } from '../../../jobs/sceneJobs'
import { currentSceneId } from '../../../library/currentScene'
import { DEFAULT_PROJECT } from '../../../project/model'
import { briefApi, type BriefApi } from '../../scene/briefApi'
import { candidateCredits, lookOf } from '../../scene/design/model'
import type { ConceptQuality } from '../../../shared/sceneContract'
import { kitChanged, piecesApi, type PiecesApi } from '../../scene/piecesApi'
import type { SetPlaceState } from '../../scene/useSetPlace'
import { usePieces } from '../../scene/usePieces'
import { useSheetElements } from '../scene/castPeople'
import { useStageScene } from '../scene/StageScene'
import { Lightbox, PriceButton } from '../../ui'
import { ObjectCard } from './ObjectCard'
import { LookImage } from './LookImage'
import { ModelPreview } from './ModelPreview'
import { PieceBuild } from './PieceBuild'
import { PropAdvanced } from './PropAdvanced'
import { readModels, withModel, type ModelHistory } from './modelHistory'
import { propParts, setPropParts } from './propPrefs'
import { conceptPrompt } from '../../../../server/scene/conceptText.ts'
import type { PropParts } from '../../../shared/sceneContract'
import { PropDrawParts } from './PropDrawParts'
import { SentLine } from './SentLine'

const MORE_Q: ConceptQuality = 'draft'
const say = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** the one dialog for the picked prop; null until the scene design (and so the prop's tile) exists. The outer only reads the
 *  scene context: everything else (the sheet, the pieces route) needs the providers that come with it. */
export function PropCard({ place, lab, pieces, startTab, onClose }: {
  /** the one selection's composing state (the Set's own) */
  place: SetPlaceState
  lab?: ProjectionLabState
  /** tests: the pieces route (jsdom has none) */
  pieces?: PiecesApi
  /** 'advanced': open straight on the Advanced tab (the piece panel's Advanced…) */
  startTab?: 'look' | 'advanced'
  onClose: () => void
}) {
  const st = useStageScene()
  if (!st) return null
  return <PropCardLive place={place} lab={lab} pieces={pieces} startTab={startTab} onClose={onClose} />
}

function PropCardLive({ place, lab, pieces: piecesApiProp, startTab, onClose }: {
  place: SetPlaceState
  lab?: ProjectionLabState
  pieces?: PiecesApi
  startTab?: 'look' | 'advanced'
  onClose: () => void
}) {
  const item = place.item
  const world = lab?.kit?.world ?? null
  const tag = item?.pieceTag?.startsWith('prop:') ? item.pieceTag.slice(5) : null
  const st = useStageScene()!
  const worldId = tag && world ? world.id : null // the pieces route and the sheet read wait for the prop and the set
  const sheet = useSheetElements(st.x.bible!, worldId) // the Stage's design copy always carries the sheet routes
  const pieces = usePieces(worldId, piecesApiProp)
  const scene = currentSceneId()
  const brief: BriefApi = useMemo(() => briefApi(jobFetch, scene ?? DEFAULT_PROJECT), [scene])
  const [models, setModels] = useState<ModelHistory>({})
  const [view, setView] = useState<'picture' | '3d'>('picture')
  const [at, setAt] = useState<number | null>(null)
  const [count, setCount] = useState(1)
  const [drawing, setDrawing] = useState(false)
  const [drawError, setDrawError] = useState<string | null>(null)
  const [backError, setBackError] = useState<string | null>(null)
  const seen = useRef<string | null>(null)
  // the Advanced box, held here: the page re-renders on every keystroke (it was read from storage on render, so an edit snapped back)
  const [parts, setPartsState] = useState<PropParts>({})
  useEffect(() => { setPartsState(worldId && tag ? propParts(worldId, tag) : {}) }, [worldId, tag])
  const setParts = (p: PropParts) => { setPartsState(p); if (worldId && tag) setPropParts(worldId, tag, p) }
  useEffect(() => { setModels(readModels(worldId)); setView('picture'); setAt(null); setDrawError(null); seen.current = null }, [worldId])
  const x = st.x
  const element = sheet.elements?.find((e) => e.tag === tag) ?? null
  const tile = x.s.d.pieces.find((p) => p.tag === tag) ?? null
  const pics = (tile && tile.looks.length ? tile.looks : element?.refs) ?? []
  const picked = tile ? lookOf(tile) : element?.refs[0] ?? null
  const words = tile?.line ?? element?.line ?? ''
  const name = tile?.name ?? item?.label?.trim() ?? item?.kind ?? ''
  const t = pieces.data?.tiles.find((v) => v.tag === tag)
  const placedRun = t?.piece?.run ?? null
  const built = !!t?.piece || !!item?.glb
  const entries = (tag ? models[tag] : undefined) ?? []
  const cur = entries.find((m) => m.run === placedRun) ?? null
  const previewUrl = view === '3d' ? (cur?.url ?? t?.piece?.url ?? null) : null
  // a placed build is written to the model history once (per run): the picture and words at that moment drive the rebuild states
  useEffect(() => {
    if (!worldId || !tag || !placedRun || seen.current === `${tag}:${placedRun}`) return
    seen.current = `${tag}:${placedRun}`
    const list = readModels(worldId)[tag] ?? []
    if (!list.some((m) => m.run === placedRun)) setModels(withModel(worldId, tag, { run: placedRun, from: picked ?? '', text: words, url: t?.piece?.url ?? '', at: new Date().toISOString() }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recorded once per placed run
  }, [placedRun, worldId, tag])
  if (!item || !tag || !world || !worldId || !x.s.synced) return null // pop in once the scene's own draft has been read

  // the words the next more-pictures draw sends: the Advanced box (unless empty) and the prop's own words
  const sent = words.trim() || name.trim()
  /** every write goes through the existing routes: the design tile (the scene's own draft) and the sheet element */
  const syncElement = (refs: string[], line: string) => {
    void x.bible?.putElement({ worldId, element: { tag, kind: 'prop', refs, line } }).then(() => sheet.reread())
  }
  const setWords = (v: string) => {
    if (tile) x.s.patchPiece(tile.id, { line: v })
    syncElement([...(pics.length ? pics : picked ? [picked] : [])], v.trim() || name)
  }
  const pick = (url: string) => {
    const rest = pics.filter((u) => u !== url)
    if (tile) {
      const looks = [...tile.looks]
      const i = looks.indexOf(url)
      x.s.patchPiece(tile.id, i >= 0 ? { look: i } : { looks: [...looks, url], look: looks.length })
    }
    syncElement([url, ...rest], (words.trim() || name))
  }
  const more = async () => {
    setDrawing(true); setDrawError(null)
    try {
      const r = await brief.candidates({ type: 'prop', prompt: sent, count, name: name.trim() || tag, quality: MORE_Q, lighting: '', materials: '', ...(Object.keys(parts).length ? { parts } : {}) })
      const urls = r.urls.filter((u) => !pics.includes(u))
      if (tile && urls.length) x.s.patchPiece(tile.id, { looks: [...tile.looks, ...urls] })
      if (urls.length) syncElement([...(pics.length ? pics : []), ...urls], words.trim() || name)
      setAt(null)
    } catch (e) { setDrawError(say(e)) } finally { setDrawing(false) }
  }
  const goBack = async (run: string) => {
    setBackError(null)
    try {
      const rec = await (piecesApiProp ?? piecesApi()).complete(world.id, tag, run)
      const from = entries.find((m) => m.run === run)?.from
      if (from) pick(from)
      setView('picture')
      kitChanged(world.id)
      await pieces.refresh()
      return rec && undefined
    } catch (e) { setBackError(say(e)) }
  }

  const lookTab = (
    <div className="oc-look" style={{ gridTemplateColumns: '1fr 340px' }}>
      <div>
        <div className="oc-viewrow">
          <span className="oc-seg" role="group" aria-label="Preview type">
            <button type="button" aria-pressed={view === 'picture'} data-testid="prop-view-picture" onClick={() => setView('picture')}>Picture</button>
            <button type="button" aria-pressed={view === '3d'} data-testid="prop-view-3d" disabled={!built}
              title={built ? 'The grey built model' : 'Build it in 3D first'} onClick={() => setView('3d')}>3D preview</button>
          </span>
          {!built && <span className="st-field-hint">Build it in 3D first</span>}
        </div>
        {view === '3d' && previewUrl ? (
          <ModelPreview url={previewUrl} label={`The grey 3D model of ${name}`} />
        ) : (
          <div className="oc-pane oc-pane-wide">
            {picked && (
              <button type="button" className="oc-pane-view" aria-label="See it large" title="Click to see it large" data-testid="prop-main-view"
                onClick={() => setAt(Math.max(0, pics.indexOf(picked)))}><LookImage src={picked} alt={name} testId="prop-main" /></button>
            )}
            <span className="oc-badge ok">Picked{picked ? `: ${pics.indexOf(picked) >= 0 ? `picture ${pics.indexOf(picked) + 1}` : ''}` : ''}</span>
            {built && cur && picked === cur.from && <span className="oc-badge ok oc-badge-r" data-testid="prop-built-badge">Built in 3D</span>}
          </div>
        )}
        <div className="oc-hist-h"><span>Pictures to build from</span><span className="st-muted">{pics.length} · click one to pick it; click the large one to see it bigger</span></div>
        <div className="oc-sw">
          <button type="button" className="oc-arr oc-arr-l" aria-label="Earlier pictures" onClick={() => scrollStrip(-1)}>‹</button>
          <div className="oc-strip" data-testid="prop-grid">
            {pics.map((u, i) => (
              <button key={`${i}:${u}`} type="button" className={`oc-thumb oc-thumb-wide${u === picked ? ' on' : ''}`}
                aria-pressed={u === picked} aria-label={`Picture ${i + 1}`} onClick={() => pick(u)} data-testid={`prop-pic-${i}`}>
                <LookImage src={u} alt={`Picture ${i + 1}`} />
                <span className="oc-lab">{i + 1}</span>
                {u === picked && <span className="oc-tick">✓</span>}
                {built && cur && u === cur.from && <span className="oc-built" data-testid={`prop-pic-built-${i}`}>3D</span>}
              </button>
            ))}
          </div>
          <button type="button" className="oc-arr oc-arr-r" aria-label="Later pictures" onClick={() => scrollStrip(1)}>›</button>
        </div>
      </div>
      <div>
        <div className="oc-field">
          <label htmlFor="prop-words">What it is</label>
          <div className="oc-box">
            <textarea id="prop-words" rows={5} value={words} placeholder="Shape, colour, age, condition." spellCheck={false}
              onChange={(e) => setWords(e.target.value)} data-testid="prop-words" />
          </div>
        </div>
        <PieceBuild tag={tag} p={pieces} models={entries} pics={pics} picked={picked} text={words} goBack={goBack} />
        <div className="oc-count" style={{ marginTop: 12 }} data-testid="prop-more-count">
          <span className="oc-stepper">
            <button type="button" disabled={count <= 1} onClick={() => setCount(count - 1)} aria-label="Fewer pictures">−</button>
            <output>{count}</output>
            <button type="button" disabled={count >= 4} onClick={() => setCount(count + 1)} aria-label="More pictures">+</button>
          </span>
          {drawing
            ? <button type="button" className="st-btn" disabled data-testid="prop-more"><span className="oc-spin" />Making pictures…</button>
            : <PriceButton verb="Generate more pictures" price={candidateCredits('prop', count, MORE_Q)} disabled={!words.trim() && !name.trim()}
                title="More pictures for the 3D build, drawn from these words" onClick={() => void more()} testId="prop-more" />}
        </div>
        <SentLine testId="prop-more-sent" text={conceptPrompt('prop', { description: sent, parts })} />
        {drawError && <p className="st-warn" role="alert" data-testid="prop-more-error">The pictures were not drawn. {drawError}</p>}
        {backError && <p className="st-warn" role="alert" data-testid="prop-back-error">The model was not put back. {backError}</p>}
      </div>
    </div>
  )

  const advancedTab = (
    <>
      <PropDrawParts description={sent} parts={parts} onChange={setParts} testId="prop-part" />
      <PropAdvanced place={place} lab={lab} />
    </>
  )

  return (
    <>
      <ObjectCard kind="prop" name={name} onRename={tile ? (v) => x.s.patchPiece(tile.id, { name: v }) : undefined}
        look={lookTab} advanced={advancedTab} startTab={startTab} onClose={onClose} />
      <Lightbox items={pics.map((u, i) => ({ src: u, label: `${name} · picture ${i + 1}` }))} index={at} onIndex={setAt} onClose={() => setAt(null)}
        aside={at !== null && (
          <span className="oc-lb-aside">
            <button type="button" className={`st-btn${pics[at] !== picked ? ' st-primary' : ''}`} data-testid="prop-lightbox-pick"
              onClick={() => { pick(pics[at]); setAt(null) }}>{pics[at] === picked ? '✓ Picked' : 'Pick this picture'}</button>
            <span className="st-field-hint">Looking and picking are free. Building in 3D is a separate button with its price.</span>
          </span>
        )} />
    </>
  )
}

const scrollStrip = (dir: number) => {
  const el = document.querySelector<HTMLElement>('.oc-strip')
  el?.scrollBy({ left: dir * ((el.querySelector('.oc-thumb')?.clientWidth ?? 118) + 8), behavior: 'smooth' })
}
