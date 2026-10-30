// React's view of the per-scene job store (sceneJobs.ts): which jobs run (every screen that shows a paid button reads this, so a job
// started on one screen keeps its button disabled on all of them), a consumer that applies finished results, and the re-attach poll.
import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { JobIntent, SceneJobRecord } from '../shared/libraryContract'
import { currentSceneId, useCurrentScene } from '../library/currentScene'
import { sceneJobs, type JobConsumer, type JobsSnapshot, type SceneJobs } from './sceneJobs'

/** the job store of the scene the studio is in (non-React callers: currentJobs()) */
export function useCurrentJobs(): SceneJobs { return sceneJobs(useCurrentScene().id) }
export const currentJobs = (): SceneJobs => sceneJobs(currentSceneId())

export function useJobs(store: SceneJobs): JobsSnapshot { return useSyncExternalStore(store.subscribe, store.snapshot) }

/** the running job of this intent (and target), or null; re-renders when it starts and when it ends */
export function useJobRunning(store: SceneJobs, intent: JobIntent, target?: string): SceneJobRecord | null {
  const snap = useJobs(store)
  return snap.jobs.find((j) => j.status === 'running' && j.intent === intent && (target === undefined || j.target === target)) ?? null
}

/** when a running job began (epoch ms) for a progress clock, or null */
export const sinceOf = (j: SceneJobRecord | null): number | null => (j ? Date.parse(j.startedAt) || null : null)

/**
 * Registers this hook as the consumer of finished jobs of `intents` while mounted and `ready` (e.g. once the draft is read back, so
 * a recovered result lands on the loaded design). Returns the owner token to pass as JobTag.owner: while this hook is mounted the
 * call that pressed applies its own result; after it unmounts, the next consumer gets it through `apply`.
 */
export function useJobConsumer(store: SceneJobs, c: JobConsumer, ready = true): object {
  const owner = useRef({}).current
  const latest = useRef(c)
  latest.current = c
  const key = c.intents.join(',')
  const parses = !!c.parse
  useEffect(() => {
    if (!ready) return
    return store.own(owner, {
      intents: key.split(',') as JobIntent[],
      ...(parses ? { parse: (j, r) => latest.current.parse!(j, r) } : {}),
      apply: (j, o) => latest.current.apply(j, o),
    })
  }, [store, owner, key, parses, ready])
  return owner
}

/** the studio keeps the current scene's jobs in step with the server (jobs from before a reload, or another tab's) */
export function useAttachJobs(store: SceneJobs, ms?: number): void {
  useEffect(() => (store.scene ? store.attach(ms) : undefined), [store, ms])
}
