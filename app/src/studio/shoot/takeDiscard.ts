// Discard a locked take, asked first (QA m13): Shoot's Takes list and the Stage's take list share it. The take leaves every list; its
// files are kept aside on disk, never deleted, as they were paid for. Off while a paid still or render of that take runs (the result
// is written into the take's folder; the server refuses it too).
import { useState } from 'react'
import { useCurrentJobs, useJobs } from '../../jobs/useSceneJobs'
import { refreshScene } from '../../library/currentScene'
import { setCurrentTake, useCurrentTakeId } from './currentTake'
import { discardTake } from './heroApi'
import { refreshLockedTakes } from './worldTakes'

/** the paid jobs filed under a take */
const TAKE_JOBS: readonly string[] = ['hero', 'heroFinish', 'l2r']
export const DISCARD_BUSY = 'A still or render of this take is running: discard it once that lands.'

export function useTakeDiscard(after?: () => void | Promise<void>) {
  const cur = useCurrentTakeId()
  const [asking, setAsking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { jobs } = useJobs(useCurrentJobs())
  const busy = (id: string) => jobs.some((j) => j.status === 'running' && j.target === id && TAKE_JOBS.includes(j.intent))
  const discard = async (id: string) => {
    setAsking(null); setError(null)
    try {
      await discardTake(id)
      if (id === cur) setCurrentTake(null)
      await refreshLockedTakes()
      await after?.()
      void refreshScene() // the scene's take counts (Earlier sets, Home's stage reached) at once, not at the next poll
    } catch (e) { setError(e instanceof Error ? e.message : 'The take could not be discarded.') }
  }
  return { asking, ask: setAsking, error, busy, discard }
}
