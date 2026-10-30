import { useCallback, useEffect, useRef, useState } from 'react'
import { lensFor } from './engine/manifest'
import { loadShot, shotSource, type LoadedShot } from './engine/modes'
import { fetchManifest, type BankShot } from './engine/sources'
import { Stage } from './engine/Stage'
import { depthRange } from './math/depth'
import { matchesSet } from './performance/frames'
import { plateLens, plateSource } from './performance/plate'
import { resolveWorldId } from './engine/worldId'
import { usePerformance } from './performance/usePerformance'
import { useOperator } from './operator/useOperator'
import type { StillTriggerDeps } from './operator/stillTrigger'
import { useViewAngle } from './shoot/useViewAngle'
import { useSplatView } from './splats/useSplatView'
import { loadKitSource, sourcePath } from './stage3d/kitSource'
import { useKit } from './stage3d/useKit'
import { DEFAULT_SETTINGS, sourcePatch, type Readouts, type Settings } from './ui/settings'

declare global {
  interface Window { __projectionLab?: Stage }
}

const MANIFEST_POLL_MS = 10_000
/** the operator's still key takes no still (stillTrigger's STILL_KEY_ENABLED is off): stills are Shoot's hero stills */
const NO_STILL: StillTriggerDeps = { blocked: () => 'no test stills', take: async () => {} }
const noMove = () => {}

/**
 * The studio's one Stage and the hooks around it (the world on the set, its kit and performance, the operator camera).
 * Used once, by the studio shell, whose screens all read this same instance. Attach `host` to the viewport element.
 * `onStage`: the viewport is visible on this page (Shoot). Off it, no key drives the camera (fly keys off, operator input detached).
 */
export function useProjectionLab({ onStage = true }: { onStage?: boolean } = {}) {
  const host = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Stage | null>(null)
  const [ready, setReady] = useState(false)
  const [stage, setStage] = useState<Stage | null>(null)
  const [s, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [shots, setShots] = useState<BankShot[] | null>(null)
  const [r, setReadouts] = useState<Readouts>({ status: '', grid: null, range: null, exporting: null })
  const loaded = useRef<{ key: string; shot: LoadedShot } | null>(null)
  const lastSource = useRef<string | null>(null)
  const lastShape = useRef<string | null>(null)

  const set = useCallback((patch: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...patch })), [])
  const report = useCallback((patch: Partial<Readouts>) => setReadouts((prev) => ({ ...prev, ...patch })), [])

  useEffect(() => {
    const stage = new Stage(host.current!)
    stageRef.current = stage
    window.__projectionLab = stage
    setReady(true)
    setStage(stage)
    return () => {
      stage.dispose()
      stageRef.current = null
      delete window.__projectionLab
      loaded.current = null
    }
  }, [])

  // Pick up the AI still bank whenever it appears or grows.
  useEffect(() => {
    let alive = true
    const poll = async () => {
      const next = await fetchManifest()
      if (!alive) return
      setShots((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    }
    poll()
    const id = setInterval(poll, MANIFEST_POLL_MS)
    return () => { alive = false; clearInterval(id) }
  }, [])

  // Load / rebuild whenever the source or the projection parameters change.
  const { source, depthIndex, depth, edge, planeAware, graze, step, focal, dequantize, sharpen } = s
  // the approved performance on the set; with a plate it is also the set's source (t29)
  // a kit world (Stage3D): built in 3D from its plan, with the 3D performer as its performance
  const kit = useKit(stage, source ? shots?.find((x) => x.id === source) : undefined)
  const performance = usePerformance(stage, source, kit)
  const plate = performance.plate
  // the lab's current world, passed to the surround layer explicitly: the set shown, or the loaded performance's world
  const packLocation = performance.layer?.pack.locationId ?? null
  useEffect(() => {
    const stage = stageRef.current
    if (!ready || !stage) return
    let alive = true
    const id = packLocation ?? (source ? source.replace(/^.*\//, '') : null)
    if (!id) { stage.surround.setWorld(null); return }
    resolveWorldId(id).then((w) => { if (alive) stage.surround.setWorld(w) })
    return () => { alive = false }
  }, [ready, source, packLocation])

  useEffect(() => {
    const stage = stageRef.current
    if (!ready || !stage) return
    let cancelled = false
    stage.setEmpty(!source)
    const grid = { step, edgeThreshold: edge, planeAware, grazeDeg: graze }
    const run = async () => {
      if (!source) {
        // a scene with no world yet: no set at all, the plain ground-and-sky backdrop stands (never a test set)
        stage.clearLayers()
        stage.setSource(null)
        stage.rebuild(grid)
        report({ grid: null, range: null, status: 'No set yet — it lands once the scene has a world' })
      } else if (sourcePath(shots?.find((x) => x.id === source)) === 'kit') {
        report({ grid: null, status: loadKitSource(stage, shots!.find((x) => x.id === source)!, grid) })
      } else {
        const shot = shots?.find((x) => x.id === source)
        if (!shot) return report({ status: shots ? `Shot ${source} is not in the manifest` : 'Waiting for manifest…' })
        const key = `${shot.id}#${depthIndex}`
        if (loaded.current?.key !== key) {
          report({ status: `Loading ${shot.id}…` })
          const data = await loadShot(shot, depthIndex)
          if (cancelled) return
          loaded.current = { key, shot: data }
        }
        const data = loaded.current!.shot
        const entry = shot.depths[depthIndex]
        // the performance's own plate as the set while it is on this set (t29), else the location's still
        const fromPlate = plate && matchesSet(plate.locationId, shot.id) ? plateSource(plate, entry, depth, { sharpen, edge }, shot) : null
        const src = fromPlate ?? shotSource(data, depth, { dequantize, sharpen, edge })
        // A manifest FOV (MoGe's measured vfov) sets the lens; the focal slider only applies when there is none.
        const lens = fromPlate ? plateLens(plate!) : lensFor(shot, entry, focal, src.width / src.height)
        stage.setProjectorLens(lens.focalMm, src.width / src.height)
        stage.setSource(src)
        const g = stage.rebuild(grid)
        const from = shot.manifest ?? 'manifest'
        const what = fromPlate ? `set from performance ${plate!.packId}'s plate ${plate!.width}×${plate!.height}` : `${data.bits}-bit depth ${data.image.width}×${data.image.height}`
        report({ grid: g, status: `${shot.id} (${from}) · ${entry?.model} · ${what} · lens: ${lens.label}` })
      }
      const src = stage.source
      report({ range: src ? depthRange(src.depth) : null })
      // what sets the set's scale: a new depth model or depth values (or lens) on the same shot moves every surface
      const shape = JSON.stringify([depthIndex, depth, focal, plate?.packId ?? null])
      if (lastSource.current !== source) {
        // extra projector layers belong to the source they were made from
        stage.clearLayers()
        stage.pivot.manual = null // a placed pivot belongs to the set it was placed on
        stage.snapToProjector()
      } else if (lastShape.current !== shape) stage.repivot()
      lastSource.current = source
      lastShape.current = shape
    }
    run().catch((e: unknown) => report({ status: `Error: ${e instanceof Error ? e.message : String(e)}` }))
    return () => { cancelled = true }
  }, [ready, source, depthIndex, depth, edge, planeAware, graze, step, focal, dequantize, sharpen, shots, report, plate])

  useEffect(() => { stageRef.current?.setHoleMask(s.holeMask) }, [ready, s.holeMask])
  useEffect(() => { stage?.setInputEnabled(onStage) }, [stage, onStage])

  const shot = shots?.find((x) => x.id === source)
  const op = useOperator(stage, NO_STILL, onStage, source)
  const angle = useViewAngle(stage, noMove, op.active)
  const splats = useSplatView(stage, s.view, { stride: s.stride, edgeThreshold: edge, planeAware, sharpen })
  useEffect(() => { stage?.setLook(s.look) }, [stage, s.look])

  /** Pick a source exactly as the Source list did (a new source clears extra layers in the load effect). */
  const pickSource = (id: string) => set(sourcePatch(shots, id, s.depth))

  return {
    host, stage, s, set, shots, r, shot, pickSource, kit,
    /** re-read the manifests now (a world just registered) instead of waiting for the poll */
    refreshShots: async () => { const next = await fetchManifest(); setShots(next); return next },
    op, angle, splats, performance,
  }
}

export type ProjectionLabState = ReturnType<typeof useProjectionLab>
