// The lab load effect's kit branch: a kit world has no still + depth to project, so the set is emptied (the kit layer, built by
// useKit, is the set) and the projector takes the master camera's lens, so "snap" and the gizmo frame the master view.
import type { BankShot } from '../engine/manifest'
import { KIT_MASTER_MM, KIT_STILL_H, KIT_STILL_W } from '../../../../server/stage3d/master'
import { isKitShot, kitWorldId } from './kitApi'

/** The part of the stage the branch touches (a fake in the tests). */
export interface KitSourceStage<G = unknown> {
  setProjectorLens(focalMm: number, aspect: number): void
  setSource(source: null): void
  rebuild(options: G): unknown
}

/** Which way the load effect goes for this shot: the kit path (3D world) or the bank path (still + depth). */
export const sourcePath = (shot: BankShot | undefined): 'kit' | 'bank' => (isKitShot(shot) ? 'kit' : 'bank')

/** Empty the projected set and set the master lens; returns the status line. */
export function loadKitSource<G>(stage: KitSourceStage<G>, shot: BankShot, grid: G): string {
  stage.setProjectorLens(KIT_MASTER_MM, KIT_STILL_W / KIT_STILL_H)
  stage.setSource(null)
  stage.rebuild(grid) // no source: drops the old grid
  return `${kitWorldId(shot)} · kit world (3D geometry from its plan) · master lens ${KIT_MASTER_MM} mm`
}
