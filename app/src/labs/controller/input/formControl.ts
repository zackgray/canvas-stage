// Keys typed into a page control are the page's, not the camera's: both keyboard camera drivers (the operator's
// KeyboardMouse and the projection lab's fly keys) skip events aimed at one.

const CONTROLS = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'])

/** True for any form control (an input of any type, select, textarea, button) or editable content. */
export function isFormControl(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null
  return !!t && (CONTROLS.has(t.tagName) || t.isContentEditable === true)
}
