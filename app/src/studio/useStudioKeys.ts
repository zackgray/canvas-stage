import { useEffect } from 'react'
import { stageStep, studioHash, type Stage } from './route'

/** Is the key going to a control the user is typing in? Then it is not ours. */
export function typingTarget(t: EventTarget | null): boolean {
  const el = t as { tagName?: string; isContentEditable?: boolean } | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || !!el.isContentEditable
}

/** a modal (the lightbox, an ask) is up: it owns the keyboard */
const modalOpen = () => typeof document !== 'undefined' && !!document.querySelector('[aria-modal="true"]')

/**
 * ← / → move to the neighbouring stage. Off while typing, with a modifier held, and while `suspended` (the Stage in Operator mode,
 * where the arrow keys are the camera's look axes).
 */
export function useStudioKeys(stage: Stage, suspended: boolean, scene?: string | null): void {
  useEffect(() => {
    if (suspended) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || typingTarget(e.target) || modalOpen()) return
      const to = e.code === 'ArrowLeft' ? stageStep(stage, -1) : e.code === 'ArrowRight' ? stageStep(stage, 1) : null
      if (!to) return
      e.preventDefault()
      window.location.hash = studioHash(to, scene)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stage, suspended, scene])
}
