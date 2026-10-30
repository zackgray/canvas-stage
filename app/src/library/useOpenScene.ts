// The studio's route names its scene: open it (every stage screen then reads it). A route that names none is Home's (StudioApp),
// so nothing here guesses a scene.
import { useEffect } from 'react'
import { openScene } from './currentScene'

export function useOpenScene(scene: string): void {
  useEffect(() => { openScene(scene) }, [scene])
}
