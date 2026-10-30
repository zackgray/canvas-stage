import { useEffect, useState } from 'react'
import { StudioRoot } from './studio/mount'
import { landingRoute } from './studio/route'

function currentPath() {
  return window.location.hash.replace(/^#\/?/, '')
}

/**
 * The one focus rule for every plain button: a mouse click hands the keyboard back to the viewport, so the
 * shortcut keys (the camera keys, O, G, R, S, Space) keep working after a click and Space / Enter never
 * re-press the last button a shortcut key was meant for. Without it the clicked button keeps the focus and
 * the camera drivers drop every key (labs/controller/input/formControl.ts counts a button as a form control).
 * A click the keyboard made (detail 0, Enter / Space on a Tab-focused button) keeps its focus: that user is
 * on the keyboard path and expects the button to stay.
 */
export function useBlurButtonsOnClick(): void {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.detail === 0) return
      const t = e.target
      if (t instanceof HTMLButtonElement) t.blur()
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
}

/** The app is the studio: Home at #/studio, a scene at #/studio/<scene>/<stage>. Any other hash (empty, stale or retired) lands on Home. */
export default function App() {
  const [path, setPath] = useState(currentPath)
  useBlurButtonsOnClick()

  useEffect(() => {
    const onHash = () => setPath(currentPath())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const { route, redirect } = landingRoute(path)
  // replace, not push: Back never returns to the dead hash
  useEffect(() => { if (redirect) window.history.replaceState(null, '', redirect) }, [redirect])

  return <StudioRoot route={route} />
}
