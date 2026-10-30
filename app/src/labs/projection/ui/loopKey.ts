// L toggles the world clock's Loop while the timeline is on the page (Build, Shoot), in Orbit and Operator mode alike.
import { useEffect } from 'react'
import { isFormControl } from '../../controller/input/formControl'
import type { World } from '../world/World'

type KeyLike = Pick<KeyboardEvent, 'code' | 'repeat' | 'ctrlKey' | 'metaKey' | 'altKey' | 'target'>

/** Toggle Loop on L (not on repeat, with a modifier, or typing in a control); returns whether it did. */
export function loopKey(world: World, e: KeyLike): boolean {
  if (e.code !== 'KeyL' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || isFormControl(e.target)) return false
  world.clock.toggleLoop()
  return true
}

/** Listen for L while mounted. */
export function useLoopKey(world: World | null) {
  useEffect(() => {
    if (!world) return
    const down = (e: KeyboardEvent) => { loopKey(world, e) }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [world])
}
