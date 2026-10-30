// What the operator's Orbit rig circles on the stage. Manual: the pivot the user placed (Set pivot + a click on the view,
// a right-click on the view, a double-click in Orbit camera mode, or C / R3 = what is at the frame centre now); until
// one is placed, the surface at the frame centre (the old behaviour). Performance: the loaded performance's actor centre
// over the clip (one fixed point; Manual's rules when no performance is loaded). Manual is the default without a
// performance; when one (with actors) is loaded the mode defaults to Performance, unless the user has chosen Manual or
// placed a pivot since it became available. React-free; the host is the Stage (stagePivotHost).
import { Vector2, type Vector3 } from 'three'
import type { Stage } from '../engine/Stage'

export type PivotMode = 'manual' | 'performance'
export const PIVOT_MODES: PivotMode[] = ['manual', 'performance']

export interface PivotHost {
  /** the pivot the user placed, or null */
  manual(): Vector3 | null
  /** place (or with null, clear) the manual pivot; shows the marker there, never moves the camera */
  setManual(p: Vector3 | null): void
  /** the surface at the frame centre, or null (sky, holes) */
  centreHit(): Vector3 | null
  /** the frame-centre fallback: the surface there, else the current pivot; the marker moves there */
  aim(): Vector3
  /** the loaded performance's clip centre (world), or null without one */
  performance(): Vector3 | null
  /** show the marker at p (the camera does not move) */
  show(p: Vector3): void
  /** arm a one-shot click on the view that places the manual pivot; returns the cancel */
  pick(done: (p: Vector3 | null) => void): () => void
  /** a right-click on the view hands the surface point under the cursor to `fn` (null unhooks) */
  contextPick?(fn: ((p: Vector3) => void) | null): void
}

/** What C / R3 did to the pivot (the engine turns it into the flash). */
export type RecentreKind = 'performance' | 'placed' | 'kept' | 'fallback'
export const RECENTRE_TEXT: Record<RecentreKind, string> = {
  performance: 'Pivot on the actors',
  placed: 'Pivot placed',
  kept: 'Nothing under the reticle: pivot kept',
  fallback: 'Nothing under the reticle: orbiting the last pivot',
}

export class OrbitPivot {
  mode: PivotMode = 'manual'
  private _host: PivotHost | null = null
  get host() { return this._host }
  set host(h: PivotHost | null) {
    if (h === this._host) return
    this._host?.contextPick?.(null)
    this._host = h
    h?.contextPick?.((p) => this.contextPlace(p))
  }
  /** what the last C / R3 did (null until one re-targeted the orbit) */
  lastRecentre: { kind: RecentreKind; at: Vector3 } | null = null
  /** the user chose Manual or placed a pivot since a performance became available: no automatic Performance */
  private chosen = false
  private wasAvailable = false
  private seenManual: Vector3 | null = null
  /**
   * Re-anchor the orbit on the new pivot (the engine wires this; refused while recording). `keepAim`: a pivot placed in
   * the view keeps the framing (no swing); a mode switch turns the camera to the pivot (Performance frames the actors).
   */
  onChange: (keepAim: boolean) => void = () => {}
  /** false while a take records: the pivot holds */
  canChange: () => boolean = () => true
  /** a right-click places the pivot only while this holds (the engine: the Orbit rig is live, no playback) */
  accepts: () => boolean = () => true
  private cancelPick: (() => void) | null = null

  get picking() { return !!this.cancelPick }

  /** Performance is on offer only with a performance (with actors) loaded. */
  available(m: PivotMode): boolean {
    return m === 'manual' || !!this.host?.performance()
  }

  /** What the orbit circles now (null: no host, the engine falls back to its own default). */
  target(): Vector3 | null {
    const h = this.host
    if (!h) return null
    const p = this.mode === 'performance' ? h.performance() : null
    const m = p ?? h.manual()
    if (!m) return h.aim()
    h.show(m)
    return m
  }

  /** C / R3: Manual places the pivot on what is at the frame centre now; Performance re-frames the actors' centre. */
  recentre(): Vector3 | null {
    const h = this.host
    if (!h) return null
    let kind: RecentreKind
    if (this.mode === 'performance' && h.performance()) kind = 'performance'
    else {
      const p = this.mode === 'manual' ? h.centreHit() : null
      if (p) { h.setManual(p); this.choose() }
      kind = p ? 'placed' : h.manual() ? 'kept' : 'fallback'
    }
    const at = this.target()
    this.lastRecentre = at ? { kind, at: at.clone() } : null
    return at
  }

  setMode(m: PivotMode) {
    if (!this.canChange() || !this.available(m)) return
    if (m === 'manual') this.choose() // explicit, even when already Manual
    if (m === this.mode) return
    this.mode = m
    this.onChange(false)
  }

  /**
   * Per tick: a performance (with actors) that has become available turns the mode to Performance, unless the user
   * has chosen Manual or placed a pivot since (a double-click in Orbit camera mode counts). Held while a take records.
   */
  sync() {
    const h = this.host
    if (!h) return
    const m = h.manual()
    if (m && m !== this.seenManual) this.chosen = true
    this.seenManual = m
    const avail = this.available('performance')
    if (avail && !this.wasAvailable) this.chosen = false // a new performance: its own default
    this.wasAvailable = avail
    if (avail && !this.chosen && this.mode === 'manual' && this.canChange()) {
      this.mode = 'performance'
      this.onChange(false)
    }
  }

  /** the user chose Manual / placed a pivot: it sticks while the performance on offer now stays (a later one resets it) */
  private choose() {
    this.chosen = true
    this.wasAvailable = this.available('performance')
  }

  /** A right-click on the view: the pivot goes on the surface under the cursor and the mode to Manual. */
  contextPlace(p: Vector3): boolean {
    if (!this.accepts()) return false
    this.endPick()
    return this.place(p)
  }

  /** Arm Set pivot: the next click on the view places the manual pivot (and switches to Manual). Again = cancel. */
  pick() {
    if (this.cancelPick) return this.endPick()
    if (!this.host || !this.canChange()) return
    this.cancelPick = this.host.pick((p) => {
      this.cancelPick = null
      if (!p || !this.canChange()) return
      this.choose()
      this.mode = 'manual'
      this.onChange(true)
    })
  }

  /** Place the manual pivot at p (a mouse-down on the view) and switch to Manual; false while a take records. */
  place(p: Vector3): boolean {
    if (!this.host || !this.canChange()) return false
    this.host.setManual(p)
    this.choose()
    this.mode = 'manual'
    this.onChange(true)
    return true
  }

  /** Forget the placed pivot (back to the frame-centre fallback). */
  clear() {
    if (!this.host || !this.canChange()) return
    this.host.setManual(null)
    this.onChange(true)
  }

  hasManual() { return !!this.host?.manual() }

  endPick() {
    const c = this.cancelPick
    this.cancelPick = null
    c?.()
  }
}

/** The Stage as the pivot's host. */
export function stagePivotHost(stage: Stage): PivotHost {
  const pv = stage.pivot
  return {
    manual: () => pv.manual,
    setManual: (p) => pv.setManual(p),
    centreHit: () => pv.hit(new Vector2(0, 0)),
    aim: () => stage.aimPivot(),
    performance: () => stage.world.performance?.pivot?.() ?? null,
    show: (p) => pv.set(p, false),
    pick: (done) => pv.pick(done),
    contextPick: (fn) => { pv.contextPick = fn },
  }
}
