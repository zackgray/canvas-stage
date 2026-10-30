// Leaving the page while a paid press is still queued drops it (server/jobs/context.ts: a job whose page goes away before its turn
// is refused free, nothing runs, nothing is billed), so the browser asks first. A press only a moment old counts too: the server's
// "waiting" has not been read back yet (the job store syncs every few seconds), and that window is exactly where a quick close lost
// a render that the page had already called sent.
import { useEffect } from 'react'
import type { SceneJobRecord } from '../shared/libraryContract'
import { isWaiting, type SceneJobs } from './sceneJobs'
import { useCurrentJobs } from './useSceneJobs'

/** a press this young may be queued without the page knowing yet */
export const FRESH_PRESS_MS = 10_000

/** true when closing the page now would lose a paid job that has not started (queued, or too new to know) */
export function jobsAtRisk(jobs: readonly SceneJobRecord[], now: number): boolean {
  return jobs.some((j) => j.status === 'running' && (isWaiting(j) || now - Date.parse(j.startedAt) < FRESH_PRESS_MS))
}

export function useLeaveGuard(store: SceneJobs = useCurrentJobs()): void {
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!jobsAtRisk(store.snapshot().jobs, store.now())) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [store])
}
