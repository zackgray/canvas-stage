// The option rail's content (layout wave L2; L3 adds Add mode and the paid redraw): what the rail shows for the one selection —
// the performer's cast-card looks, a prop's pictures (its Bible element's refs, the built tile first), a plain kit piece's swap
// list; with a marked spot, Add mode on the chosen kind. Every free press is
// an existing route: Use this on a look keeps its face and appends the cast card's next version (briefApi.saveCard, the Board's own
// approval); on a tile it rewrites the element's refs (the Bible element upsert Build the set uses); on a kit kind it is the piece
// route's swapTo. L3: Add mode
// places through the piece add route (a kind, or a labelled stand-in for one of the set's props; no route adds a person, so the
// rail has no person Add mode); the "+ Generate a prop" card's screen draws candidates through the same paid route the Board's
// piece details use (briefApi.candidates, a draft concept draw, in this scene's own folder), and "What should change?" redraws a
// generated card the same way (a Cast front job for a performer's look), the results added as NEW cards — nothing is
// overwritten. A drawn or uploaded candidate, once picked, becomes the scene's own prop and builds itself in 3D once
// (stageProp.ts), its tile written through the Stage's one copy of the scene design (StageScene.tsx), never beside it. L5: no card is discarded (no route discards a card-sized thing; kept looks stay with the set).
import { readFresh, writeFresh, type FreshLook, type FreshLooks } from './freshLooks'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import type { BibleElement } from '../../shared/bibleContract'
import { useProject } from '../../project/useProject'
import { bibleApi, type BibleApi } from '../scene/bibleApi'
import { briefApi, type BriefApi } from '../scene/briefApi'
import { usePieces } from '../scene/usePieces'
import { piecesApi, type PiecesApi } from '../scene/piecesApi'
import { startAutoBuild } from '../scene/pieceAutoBuild'
import { jobFetch } from '../../jobs/sceneJobs'
import { currentSceneId } from '../../library/currentScene'
import { DEFAULT_PROJECT } from '../../project/model'
import type { SetPlaceState } from '../scene/useSetPlace'
import { candidateCredits } from '../scene/design/model'
import type { ConceptQuality, PropParts } from '../../shared/sceneContract'
import {
  addGenCard, addPieceCards, addPropCard, castLookCards, kitSwapCards, propTileCards,
  performerCard, STANDIN_KIND, type RailCard, type RailContent,
} from './railModel'
import { placeStageProp, stagePropDesign, UPLOAD_DESC, type StagePropDesign } from './stageProp'
import type { AddKind } from './railBus'
import { setPropParts } from './panels/propPrefs'
import { useStageScene } from './scene/StageScene'
import type { StagePick } from './useStagePick'

export interface RailContentDeps {
  /** tests: the Bible routes (jsdom has no route) */
  bible?: BibleApi
  /** tests: the Scene design calls (the cast keep + version, the candidate draws, the upload) */
  brief?: BriefApi
  /** tests: the design a placed prop joins (else the Stage's one copy) */
  design?: StagePropDesign
  /** tests: the pieces route */
  pieces?: PiecesApi
}

/** L3: concept draws from the Stage use the draft quality (the Lightning 4-step draw; the Board's prop tiles' cheap path) */
export const STAGE_PROP_Q: ConceptQuality = 'draft'
/** what a paid redraw draws again: a performer's look (a Cast front job) or a prop's picture */
type RedrawKind = 'person' | 'prop'
/** a drawn candidate added to the rail as a NEW card (a redraw of one, or a gen screen's) */
export type { FreshLook } from './freshLooks'

const say = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** the rail's content for the current selection, or a marked spot in Add mode: null when the rail stays closed */
export function useRailContent(o: {
  lab: ProjectionLabState
  pick: StagePick | null
  place: SetPlaceState
  /** L3: Add mode — the marked spot and the chosen kind (memoized by the caller, so the content keeps its identity) */
  add: { kind: AddKind; at: [number, number] } | null
  /** L3: drop the mark once a placement landed (the placed piece stays selected) */
  onPlaced: () => void
  onClose: () => void
  deps?: RailContentDeps
}): RailContent | null {
  const { lab, pick, place, add, onPlaced, onClose } = o
  const world = lab.kit.world
  const item = pick?.t === 'piece' ? place.item : null
  const tag = item?.pieceTag?.startsWith('prop:') ? item.pieceTag.slice(5) : null
  const proj = useProject()
  const project = proj.project
  const refresh = proj.refresh
  const bible = useMemo(() => o.deps?.bible ?? bibleApi(), [o.deps?.bible]) // eslint-disable-line react-hooks/exhaustive-deps
  // the open scene's own design calls: its draws file under its folder
  const scene = currentSceneId()
  const brief = useMemo(() => o.deps?.brief ?? briefApi(jobFetch, scene ?? DEFAULT_PROJECT), [o.deps?.brief, scene]) // eslint-disable-line react-hooks/exhaustive-deps
  const builds = useMemo(() => o.deps?.pieces ?? piecesApi(), [o.deps?.pieces]) // eslint-disable-line react-hooks/exhaustive-deps
  const [error, setError] = useState<string | null>(null)
  // the world's Bible elements (a prop's pictures and words; Add mode lists the set's props) — one read per world
  const [elements, setElements] = useState<BibleElement[] | null | undefined>(undefined)
  const worldId = world?.id ?? null
  useEffect(() => {
    setElements(undefined)
    if (!worldId) return
    let live = true
    bible.get(worldId).then((r) => { if (live) setElements(r.bible?.elements ?? null) }, () => { if (live) setElements(null) })
    return () => { live = false }
  }, [bible, worldId])
  const element = tag ? elements?.find((e) => e.tag === tag) ?? null : null
  // the built tiles' pictures (the pieces route's own state, as the Piece panel reads it)
  const pieces = usePieces(tag || add?.kind === 'prop' ? worldId : null, o.deps?.pieces)
  const tiles = pieces.data?.tiles ?? null
  const castCards = project?.ingredients.cast ?? []
  const card = performerCard(castCards, world?.perf.castId, elements)
  // L3: the paid redraws' and the gen screen's results, added to the rail as NEW cards (never an overwrite)
  // kept per world in this browser (freshLooks.ts), so a reload or leaving the Stage keeps what was paid for
  const [fresh, setFresh] = useState<FreshLooks>(() => readFresh(worldId))
  useEffect(() => { setFresh(readFresh(worldId)) }, [worldId])
  const addFresh = useCallback((key: string, looks: FreshLook[]) =>
    setFresh((prev) => { const next = { ...prev, [key]: [...(prev[key] ?? []), ...looks] }; writeFresh(worldId, next); return next }), [worldId])
  // the latest fns through refs, so the memoized content keeps its identity between renders (publishing the same object
  // again would re-render the provider) — the same pattern the swap press already used
  const liveRef = useRef({ place, onPlaced })
  useEffect(() => { liveRef.current = { place, onPlaced } })
  // the Stage's one design copy, the newest the provider published: a placed prop's tile is written through it
  const stage = useStageScene()
  const stageRef = useRef(stage)
  useEffect(() => { stageRef.current = stage })
  const designDep = o.deps?.design
  const design = useMemo(() => designDep ?? stagePropDesign(() => stageRef.current), [designDep])
  const swapRef = useRef(place.swap)
  useEffect(() => { swapRef.current = place.swap })

  const run = useCallback(async (what: string, job: () => Promise<unknown>) => {
    setError(null)
    try { await job() } catch (e) { setError(`${what}: ${say(e)}`) }
  }, [])
  // Use this on a look: the face kept under the card, then the card's next version (the Board's own approval, free)
  const useLook = useCallback((face: string, name: string, description: string) => {
    if (!card) return Promise.resolve()
    return run('The look was not kept', async () => {
      await brief.saveCard({ cardId: card.id, name, description, face })
      await refresh() // the new version is the current look
    })
  }, [brief, card, refresh, run])
  // Use this on a tile: the element rewritten with the chosen picture (its tag, kind, words and card stay)
  const useTile = useCallback((url: string) => {
    if (!tag || !worldId) return Promise.resolve()
    return run('The tile was not used', async () => {
      const cur = (await bible.get(worldId)).bible?.elements.find((e) => e.tag === tag)
      if (!cur) throw new Error('the prop has no element to rewrite')
      await bible.putElement({ worldId, element: { ...cur, refs: [url] } })
    })
  }, [bible, tag, worldId, run])
  // L3 "What should change?": the paid redraw of a generated card through the Board's own candidate routes — the change line
  // is appended to the card's words (a pasted prompt goes as typed) and the results land as NEW cards beside the original
  const redraw = useCallback((kind: RedrawKind, name: string, desc: string, change: string, key: string) => {
    const full = `${desc}, ${change.trim()}`
    const call = kind === 'person'
      ? brief.candidates({ type: 'person', prompt: full, count: 1, name })
      : brief.candidates({ type: 'prop', prompt: full, count: 1, quality: STAGE_PROP_Q })
    return call.then((r) => {
      const label = change.trim()
      addFresh(key, r.urls.map((url, i) => ({ url, name: `${name} · ${label}${r.urls.length > 1 ? ` (${i + 1})` : ''}`, desc: full })))
      return r.urls.length
    })
  }, [brief, addFresh])
  const redrawOf = useCallback((kind: RedrawKind, c: RailCard, key: string): RailCard['redraw'] => ({
    price: kind === 'person' ? candidateCredits('person', 1) : candidateCredits('prop', 1, STAGE_PROP_Q),
    run: (change) => redraw(kind, c.name, c.desc, change, key),
  }), [redraw])
  // L3 Add mode's "+ Generate a prop" screen: the screen's stepper sets the count (1..4, two candidates by default), a draft
  // concept draw
  const drawGen = useCallback((name: string, description: string, count: number, parts?: PropParts): Promise<string[]> => {
    const clean = name.trim() || 'New prop'
    const prompt = description.trim() || clean
    return brief.candidates({ type: 'prop', prompt, count, quality: STAGE_PROP_Q, name: clean, ...(parts ? { parts } : {}) }).then((r) => {
      addFresh('gen:prop', r.urls.map((url, i) => ({ url, name: `${clean} · look ${i + 1}`, desc: prompt, ...(parts ? { parts } : {}) })))
      return r.urls
    })
  }, [brief, addFresh])
  // a drawn or uploaded candidate picked: the scene's new prop (its tile, its stand-in, its element) and its one 3D build; throws
  // in words (the draw screen's Use this one shows it); the cards' click says it under the cards
  const approveNew = useCallback(async (f: FreshLook, at: [number, number]) => {
    const w = lab.kit.world
    try {
      if (!w) throw new Error('no set is open')
      const tag = await placeStageProp({
        design, bible,
        place: (kind, spot, label, pieceTag) => liveRef.current.place.add(kind, spot, label, pieceTag, { throws: true }),
        build: (id, t) => { startAutoBuild(builds, id, t) },
      }, { world: w, name: f.name.split(' · ')[0], look: f.url, desc: f.desc, at, elementTags: (elements ?? []).map((e) => e.tag) })
      // (prop-edits-hold) the ADVANCED edits it was drawn with stay its own: the prop card's more pictures draw with them too
      if (f.parts && Object.keys(f.parts).length) setPropParts(w.id, tag, f.parts)
    } catch (e) { throw new Error(`The prop was not added: ${say(e)}`) }
    liveRef.current.onPlaced()
  }, [lab.kit.world, design, bible, builds, elements])
  const placeNew = useCallback((f: FreshLook, at: [number, number]) => approveNew(f, at).catch((e: unknown) => setError(say(e))), [approveNew])

  const pickKey = pick ? JSON.stringify(pick) : null
  return useMemo<RailContent | null>(() => {
    // the NEW cards a redraw or a draw drew, spliced in beside the card they came from (rail order kept)
    const spliceFresh = (cards: RailCard[], prefix: string, build: (f: FreshLook, i: number) => RailCard): RailCard[] =>
      cards.flatMap((c) => [c, ...(fresh[`${prefix}:${c.id}`] ?? []).map((f, i) => ({ ...build(f, i), fresh: true }))])
    if (add) {
      const at = add.at
      // L3: a placement through the piece add route; the mark drops, the placed piece stays selected
      const placed = (kind: string, label?: string) => () =>
        liveRef.current.place.add(kind, at, label).then(() => liveRef.current.onPlaced())
      const base = { title: 'Add at the marked spot', error, onClose }
      if (add.kind === 'piece') return { ...base, cards: addPieceCards((kind) => placed(kind)()) }
      // a prop: the set's own props (a click places a labelled stand-in at the spot) and the drawn candidates (a click makes it the
      // scene's own prop, placed there, and builds it in 3D)
      const kit = world?.plan.kit ?? []
      const props = kit.filter((k) => k.pieceTag?.startsWith('prop:'))
      const drawn = (fresh['gen:prop'] ?? []).map((f, i) => ({
        ...addPropCard({ id: `gen:${i}`, name: f.name, img: f.url, desc: f.desc, ...(f.parts ? { parts: f.parts } : {}) }, () => placeNew(f, at)), fresh: true,
      }))
      const propCards = elements == null ? []
        : props.map((k, i) => {
          const t = k.pieceTag!.slice(5)
          const el = elements.find((e) => e.tag === t)
          const name = k.label ?? k.kind
          return addPropCard({ id: `prop:${i}`, name, img: tiles?.find((x) => x.tag === t)?.look ?? el?.refs[0] ?? null, desc: el?.line ?? name }, placed(STANDIN_KIND, name))
        })
      return {
        ...base,
        cards: [...propCards, ...drawn, addGenCard()],
        add: { kind: 'prop', at, price: (n) => candidateCredits('prop', n, STAGE_PROP_Q), draw: drawGen, buildPrice: pieces.data?.price ?? null, approve: (f) => approveNew(f, at) },
        upload: (f) => brief.uploadReference(f).then((url) => {
          addFresh('gen:prop', [{ url, name: 'New prop · upload', desc: UPLOAD_DESC }])
          return url
        }),
        ...(elements === undefined ? { note: 'Reading its pictures…' }
          : props.length === 0 && drawn.length === 0 ? { note: 'No props in the set yet — describe one below and draw candidates.' } : {}),
      }
    }
    if (pick?.t === 'mark') {
      if (!card) return { title: 'The performer — options', cards: [], note: 'Nobody plays the person yet: click them in the view to make their look.', error, onClose }
      const looks = spliceFresh(
        castLookCards(card, (v) => useLook(v.references[0] ?? '', v.name, v.description)).map((c) => ({ ...c, ...(c.img ? { redraw: redrawOf('person', c, `look:${c.id}`) } : {}) })),
        'look',
        (f, i) => {
          const base: RailCard = { id: `fresh:${i}:${f.url}`, name: f.name, desc: f.desc, img: f.url, current: false }
          return { ...base, apply: () => useLook(f.url, f.name, f.desc), redraw: redrawOf('person', base, `look:${base.id}`) }
        })
      return { title: `${card.name} — options`, cards: looks, error, onClose }
    }
    if (pick?.t === 'piece' && item) {
      const name = item.label ?? item.kind
      if (tag) {
        if (elements === undefined) return { title: `${name} — options`, cards: [], note: 'Reading its pictures…', error, onClose }
        const builtLook = tiles?.find((x) => x.tag === tag)?.look ?? null
        const propCards = spliceFresh(
          propTileCards({ tag, name, element, builtLook, desc: item.label ?? item.kind }, useTile).map((c) => ({ ...c, ...(c.img ? { redraw: redrawOf('prop', c, `tile:${c.id}`) } : {}) })),
          'tile',
          (f, i) => {
            const base: RailCard = { id: `fresh:${i}:${f.url}`, name: f.name, desc: f.desc, img: f.url, current: false }
            return { ...base, apply: () => useTile(f.url), redraw: redrawOf('prop', base, `tile:${base.id}`) }
          })
        return {
          title: `${name} — options`,
          cards: propCards,
          ...(element === null ? { note: 'Its board drawing did not move into the set: there is no picture to choose.' } : {}),
          error, onClose,
        }
      }
      if (item.glb) return { title: `${name} — options`, cards: [], note: 'Built in 3D from its board drawing: it keeps its own shape, so there is nothing to swap.', error, onClose }
      return { title: `${name} — options`, cards: kitSwapCards(item, (kind) => run('The piece was not swapped', () => swapRef.current(kind))), error, onClose }
    }
    return null // nothing picked, no mark: the rail stays closed
  }, [world?.plan, pickKey, item, tag, elements, tiles, card, error, onClose, add, fresh, useLook, useTile, redrawOf, drawGen, placeNew, approveNew, brief]) // eslint-disable-line react-hooks/exhaustive-deps
}
