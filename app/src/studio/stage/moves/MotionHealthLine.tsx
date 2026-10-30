// The one-line health status for Shoot's Blocking header (plan section 6: "New moves: ready / offline / off"). Own poll of the
// labMotion health route (the plugin caches the box probe for 10 s, so this is cheap); the motion step's state at a glance.
import { useEffect, useState } from 'react'
import type { MotionHealth } from '../../../../server/motion/types'
import { motionHealth } from './client'

const LINE: Record<MotionHealth, string> = {
  off: 'New moves: off',
  offline: 'New moves: offline',
  warming: 'New moves: starting up',
  busy: 'New moves: busy',
  ready: 'New moves: ready',
}

const HEALTH_MS = 10000

export function MotionHealthLine() {
  const [health, setHealth] = useState<MotionHealth | null>(null)
  useEffect(() => {
    let live = true
    const tick = () => {
      motionHealth().then((h) => { if (live) setHealth(h) }, () => { if (live) setHealth('offline') })
    }
    tick()
    const id = setInterval(tick, HEALTH_MS)
    return () => { live = false; clearInterval(id) }
  }, [])
  return <span className="st-field-hint" data-testid="motion-health-line">{health === null ? 'New moves: …' : LINE[health]}</span>
}
