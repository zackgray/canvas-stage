// The Advanced drawer's remembered open state: localStorage `canvas.studio.advanced.<stage>` ('1' | '0').

const keyOf = (stage: string) => `canvas.studio.advanced.${stage}`

/** The remembered open state for a stage, else `fallback` (also when storage is unavailable). */
export function readAdvancedOpen(stage: string, fallback = false): boolean {
  try {
    const v = localStorage.getItem(keyOf(stage))
    return v === '1' ? true : v === '0' ? false : fallback
  } catch { return fallback }
}

export function writeAdvancedOpen(stage: string, open: boolean): void {
  try { localStorage.setItem(keyOf(stage), open ? '1' : '0') } catch { /* storage unavailable: the drawer still works */ }
}
