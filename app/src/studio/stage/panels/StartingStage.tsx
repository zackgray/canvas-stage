// The Stage's first moments for a scene with no world: its starting world (empty, free, no planner) is being written by the Stage's
// one Build (useStageBuild.ts), and the Stage becomes the normal Stage by itself once it is there. This says so over the viewport and
// offers a free Try again if it failed. Nothing here is paid and nothing is asked.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStageScene } from '../scene/StageScene'
// its panel and viewport line are styled there; the Setup panel that used to load it is no longer on any page
import './setup.css'

export function StartingStage() {
  const st = useStageScene()
  const [host, setHost] = useState<Element | null>(null)
  useEffect(() => { setHost(document.querySelector('[data-testid="studio-viewport"]')) }, [])
  const set = st?.x.set
  const failed = !!set?.error && !set.building
  const line = failed ? set!.error : 'Opening an empty stage…'
  return (
    <div className="st-scene st-setup" data-testid="starting-stage">
      <p className={failed ? 'st-warn' : 'st-muted'} role={failed ? 'alert' : undefined} data-testid="starting-line">{line}</p>
      {failed && <button type="button" className="st-btn" data-testid="starting-retry" onClick={() => void set!.startEmpty?.()}>Try again</button>}
      {host ? createPortal(<p className="st-setup-vp" data-testid="setup-viewport">{failed ? 'The stage could not be opened' : 'Opening an empty stage…'}</p>, host) : null}
    </div>
  )
}
