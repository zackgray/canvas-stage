// The viewport right-click menu's walk presses reach the person panel's own Walk to a spot through this one channel (the menu
// never re-implements the walk): Walk to a spot / Slow walk / Run arm that same tool — one spot picker, one overlay, one save —
// and Hold here is its Stay put. WalkTo registers while it is mounted (the person is picked whenever the menu names them);
// null unregisters. Nothing here spends; the presses only edit the blocking draft.
export type WalkSpeedId = 'slow' | 'walk' | 'run'

export interface WalkArm {
  /** arm the spot picker at one of the three paces (the menu's Walk to a spot / Slow walk / Run) */
  arm: (speed: WalkSpeedId) => void
  /** the existing hold/stop: she stays where she is (the menu's Hold here, the panel's Stay put) */
  stay: () => void
}

let live: WalkArm | null = null

/** WalkTo's registration while it is mounted */
export function setWalkArm(a: WalkArm | null): void {
  live = a
}
/** the menu's Walk to a spot / Slow walk / Run press: no-op while no walk tool is mounted */
export function armWalk(speed: WalkSpeedId): void {
  live?.arm(speed)
}
/** the menu's Hold here press: no-op while no walk tool is mounted */
export function holdWalk(): void {
  live?.stay()
}
