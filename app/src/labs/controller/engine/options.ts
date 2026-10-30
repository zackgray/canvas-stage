// Engine host options: what differs when the engine drives a camera somewhere other than the controller lab.
import type { Vector3 } from 'three'
import type { RigId } from '../input/types'

export interface StillEvent {
  timelineTime: number
  focal: number
  rig: RigId
}

/** Options for hosting the engine somewhere other than the controller lab; the defaults are the controller lab. */
export interface EngineOptions {
  /** rigs on offer, in order (default: all); rig keys, Tab and the panel only reach these */
  rigs?: RigId[]
  /** starting rig (default 'follow') */
  rig?: RigId
  /** what the orbit rig circles (default, or null: the car) */
  orbitTarget?: () => Vector3 | null
  /** what C / R3 re-targets the orbit to (default: orbitTarget) */
  orbitRecentre?: () => Vector3 | null
  /** the still action (Cross / T); returns whether a still was taken and the line to flash (default: log it) */
  onStill?: (e: StillEvent) => { taken: boolean; message: string }
  /** false when the set has no car (hides car readouts); default true */
  car?: boolean
}
