// Fly it yourself (pass 3, item 13): the Camera panel's one compact row for flying the camera by hand — with a PlayStation
// controller (the browser's gamepad, or the DualSense read directly) or W A S D and the mouse, the engine's own hand flying. While
// it is on, Record films the hand-flown path (the engine's own recording) instead of a camera move. The connection line reads the
// engine's own input sources; nothing new is wired to the controller here.
import { useTicker } from '../../labs/controller/ui/useTicker'
import type { StageOperatorEngine } from '../../labs/projection/operator/stageEngine'

export const CONNECTED = 'Controller connected'
export const PRESS_A_BUTTON = 'Press a button on your controller'
/** what the controller's buttons do while flying (the engine's mapping: triggers zoom, Square records) */
export const HAND_FLY_HINT = 'Fly with the sticks, or W A S D and the mouse. L2 / R2 zoom. R (Square on the controller) records and stops.'

/** a controller is there: the DualSense read directly, or any gamepad the browser shows (it shows one after a button press) */
export function controllerConnected(engine: Pick<StageOperatorEngine, 'hub'>): boolean {
  if (engine.hub.dualsense.connected) return true
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? Array.from(navigator.getGamepads()) : []
  return pads.some((p) => !!p && p.connected)
}

const blurFocus = () => (document.activeElement as HTMLElement | null)?.blur?.()

export function HandFlyRow({ engine, fly, onFly, disabled }: { engine: StageOperatorEngine; fly: boolean; onFly: (on: boolean) => void; disabled?: boolean }) {
  useTicker(2) // a controller plugged in or woken shows within half a second
  const connected = controllerConnected(engine)
  const toggle = () => {
    if (!fly) { if (engine.move) engine.stopPreset(); engine.setRig('free') } // the hand-flown camera, from where it is now
    onFly(!fly)
    blurFocus() // R and the keys are the camera's again
  }
  return (
    <div className="st-handfly" data-testid="hand-fly">
      <button type="button" className={`st-btn${fly ? ' st-seg-on' : ''}`} aria-pressed={fly} disabled={disabled} data-testid="preset-fly"
        title="Fly the camera yourself; Record then films the path you fly" onClick={toggle}>Fly it yourself</button>
      <span className="st-muted" data-testid="controller-status">{connected ? CONNECTED : PRESS_A_BUTTON}</span>
      {fly && <p className="st-muted" data-testid="hand-fly-hint">{HAND_FLY_HINT}</p>}
    </div>
  )
}
