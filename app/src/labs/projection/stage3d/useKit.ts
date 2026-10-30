import { useEffect, useMemo, useRef, useState } from 'react'
import type { BankShot } from '../engine/manifest'
import type { Stage } from '../engine/Stage'
import { buildWorld } from '../../../stage3d/world'
import { getKitWorld, isKitShot, KIT_CHANGED, kitWorldId, type KitWorld } from './kitApi'
import { KitLayer, structuralKey } from './KitLayer'
import { getMovePreview, onMovePreview, type MovePreview } from './movePreview'
import { noteSceneSet, ownSetOnShow, stagePerf, takeOnShowFor, useTakeOnShow } from './takeOnShow'
import { setKeyOf } from '../../../studio/shoot/setKey'

/**
 * The kit world on the stage when the lab's source is one (a manifest shot with kind 'kit'): its files read from the server
 * (re-read when Perform saves its performance), the world built from plan.json and put on the stage as the set. Off a kit
 * source the stage has no kit. The performance plan is returned apart from the layer, so a new path does not rebuild the world.
 * A locked take on show with its own set (PLAN-PER-TAKE-SET.md S3) puts that set on the stage: a copy that differs only in where
 * pieces stand is applied in place, a structural one rebuilds the world; an equal copy keeps the scene's own object (no rebuild).
 */
export function useKit(stage: Stage | null, shot: BankShot | undefined) {
  const id = shot && isKitShot(shot) ? kitWorldId(shot) : null
  const [data, setData] = useState<KitWorld | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rev, setRev] = useState(0)
  const [layer, setLayer] = useState<KitLayer | null>(null)
  // the Describe-a-move "Play here" audition (track D2): a draft performance with one unsaved move action, shown on the clay
  // until cleared; only ever for the world it was made on
  const [preview, setPreview] = useState<MovePreview | null>(getMovePreview)
  useEffect(() => onMovePreview(() => setPreview(getMovePreview())), [])

  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent<{ id?: string }>).detail?.id === id) setRev((r) => r + 1) }
    window.addEventListener(KIT_CHANGED, on)
    return () => window.removeEventListener(KIT_CHANGED, on)
  }, [id])

  useEffect(() => {
    setError(null)
    if (!id) return setData(null)
    let alive = true
    getKitWorld(id).then((w) => { if (alive) setData(w) }, (e: unknown) => { if (alive) setError(`Could not read the kit world: ${e instanceof Error ? e.message : String(e)}`) })
    return () => { alive = false }
  }, [id, rev])

  const scene = data && data.id === id ? data : null
  // the set on the stage: the locked take on show's own set when it is not the scene's (takeOnShow.ts), else the scene's. `live` is
  // the world every reader sees: the scene's world with the shown set as its plan, so the Set panel, the pick, Blocking, the
  // performer, the clay and frame 0 all follow what the stage shows. The scene's own plan stays `scenePlan`.
  const onShow = useTakeOnShow()
  const scenePlanKey = useMemo(() => (scene ? JSON.stringify(scene.plan) : null), [scene])
  const own = useMemo(() => ownSetOnShow(scene?.plan ?? null, onShow, id), [scene, onShow, id])
  const ownKey = useMemo(() => (own ? setKeyOf(own.plan) : null), [own])
  const live = useMemo(() => (scene && own?.plan ? { ...scene, plan: own.plan } : scene), [scene, ownKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (id && scene) noteSceneSet(id, scene.plan) }, [id, scenePlanKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const planKey = live ? JSON.stringify(live.plan) : null
  const buildKey = live ? structuralKey(live.plan) : null
  const plan = useRef(live?.plan ?? null)
  plan.current = live?.plan ?? null
  useEffect(() => {
    if (!stage || !live || !buildKey) return
    let k: KitLayer
    try { k = new KitLayer(buildWorld(live.plan), live.id, live.plan, live.perf) } catch (e) {
      setError(`Could not build the kit world: ${e instanceof Error ? e.message : String(e)}`)
      return
    }
    stage.setKit(k)
    // the world's clock poses the layer's travelling pieces (World.addClockHook): every view, capture and the clay see the drive
    const offHook = stage.world.addClockHook({ get duration() { return k.moveDuration }, pose: (t) => k.poseAt(t) })
    setLayer(k)
    return () => {
      offHook()
      if (stage.kit === k) stage.setKit(null)
      k.dispose()
      setLayer(null)
    }
    // the world is rebuilt only when its structure (or the world) changes; a new performance keeps it, and a moved, turned or
    // resized piece is applied in place (below), so no pane blinks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, live?.id, buildKey])
  useEffect(() => {
    if (layer && plan.current && layer.plan !== plan.current) {
      layer.applyPlan(plan.current)
      stage?.world.syncClock() // a re-read plan may carry a longer (or cleared) travel: the clock and the take cap follow it
    }
  }, [layer, planKey])

  // the order of what the performer plays: a Play here audition (a draft of the scene's walk), else the locked take on show with
  // its own walk (takeOnShow.ts), else the scene's walk. Every editor of the subject reads `world.perf`: the scene's, never the take's
  const scenePerf = live?.perf ?? null
  return { id, world: live, layer: layer && layer.worldId === id ? layer : null,
    perf: (preview && preview.worldId === id ? preview.perf : null) ?? stagePerf(scenePerf, onShow, id),
    /** the locked take on show on this world (its own walk and/or its own set; null = the scene's walk and set) */
    onShow: takeOnShowFor(onShow, id),
    /** the scene's own set plan (what every set edit changes); `world.plan` is the set on show */
    scenePlan: scene?.plan ?? null,
    /** the locked take on show with its own set that is not the scene's: the stage shows it and the set is read-only (null = the
     *  scene's set is on the stage and editable) */
    ownSet: own,
    /** a Play here audition is on the clay (the performer plays it from the start at once) */
    audition: !!preview && preview.worldId === id, error }
}

export type KitState = ReturnType<typeof useKit>
