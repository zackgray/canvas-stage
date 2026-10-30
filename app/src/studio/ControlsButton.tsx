// The Stage's controls screen (controls-overlay): the Controls button beside the view switch shows the
// controller mapping table (labs/controller/ui/MappingOverlay) over the Stage, like a game's controls
// screen, and puts it away again — the button again, Escape, or the ✕. While it is up it is a modal
// (aria-modal): the camera and stage hotkeys leave the keys to it, and its Escape never reaches the rail
// or the draw screen behind it (the listener is on the capture phase, first).
import { useEffect, useState } from 'react'
import { MappingOverlay } from '../labs/controller/ui/MappingOverlay'
import './controlsButton.css'

export function ControlsButton() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation() // the rail's and the draw screen's Escape owners must not also fire
      setOpen(false)
    }
    window.addEventListener('keydown', onKey, true) // capture: ahead of every bubble-phase key map
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])
  return (
    <>
      <button type="button" data-testid="stage-controls" aria-expanded={open} title="Show the controls"
        onClick={() => setOpen(!open)}>Controls</button>
      {open && (
        <div className="st-ctl" role="dialog" aria-modal="true" aria-label="Controls" data-testid="stage-controls-overlay">
          <div className="st-ctl-card">
            <header className="st-ctl-head">
              <h3>Controls</h3>
              <button type="button" className="st-ctl-close" data-testid="stage-controls-close" title="Close (Esc)"
                onClick={() => setOpen(false)}>✕</button>
            </header>
            <MappingOverlay />
            <p className="st-ctl-hint">Pad and keyboard. Esc or the button closes this.</p>
          </div>
        </div>
      )}
    </>
  )
}
