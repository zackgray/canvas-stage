// (layout wave L3) Who owns an empty-ground click on the Stage's viewport: Blocking's path drawing, while a draw is on (its view
// sets the flag, its own Esc/click-off handling unchanged); otherwise the click marks the spot and opens the Add menu
// (useStagePick). Module-level, not React state: the pick pipeline is pointer events outside renders, and Blocking's view is the
// only other claimant. Default false: nothing drawn, the mark takes the click.
let drawing = false

/** Blocking's view calls this while a path/extra/face/look draw is on (and clears it when the draw ends) */
export const setGroundDrawing = (v: boolean): void => { drawing = v }

/** true while Blocking is drawing: an empty-ground click is a path point, not the Add mark */
export const isGroundDrawing = (): boolean => drawing
