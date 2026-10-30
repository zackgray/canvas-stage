// "Not responding - Check / Release" for any paid job of the current scene that has run past its kind's limit (hangLimits.ts).
// One mount for the whole studio (StudioApp), so every stage's running state gets it without each block carrying its own.
// Check asks Cloud for the job's status by id; Release stops waiting so the queue moves, and says the job may still bill.
import { useEffect, useState } from 'react'
import type { SceneJobRecord } from '../shared/libraryContract'
import { hangApi, type HangApi } from './hangApi'
import { isHung } from './hangLimits'
import type { SceneJobs } from './sceneJobs'
import { useJobs } from './useSceneJobs'

/** how often the page re-reads the clock to see whether a running job has gone quiet */
export const HANG_TICK_MS = 15_000

const NAMES: Record<string, string> = {
  develop: 'Developing the brief', flesh: 'Fleshing out the brief', plan: 'Planning the set', concept: 'Drawing the look', cast: 'Drawing the cast',
  master: 'Drawing the master', hero: 'Rendering the still', heroFinish: 'Finishing the still', l2r: 'Rendering the take',
}

function Notice({ job, store, api }: { job: SceneJobRecord; store: SceneJobs; api: HangApi }) {
  const [busy, setBusy] = useState(false)
  const [line, setLine] = useState<string | null>(null)
  const run = async (act: 'check' | 'release') => {
    if (!store.scene || busy) return
    setBusy(true); setLine(null)
    try {
      const r = await api[act](store.scene, job.id)
      setLine(r.message)
      await store.sync() // the record reads released / finished from the server now
    } catch (e) { setLine(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  return (
    <div className="st-warn" role="status" data-testid={`hang-${job.id}`}>
      <strong>{NAMES[job.intent] ?? 'A paid job'}: not responding.</strong>{' '}
      It has run longer than a job like it normally takes. Check asks Cloud where it stands. Release stops waiting so other jobs can go;
      it may still finish and bill, Recover fetches it by id, and nothing is sent again.{' '}
      <button type="button" disabled={busy} onClick={() => void run('check')} data-testid="hang-check">Check</button>{' '}
      <button type="button" disabled={busy} onClick={() => void run('release')} data-testid="hang-release">Release</button>
      {line && <p className="st-muted" data-testid="hang-line">{line}</p>}
    </div>
  )
}

export function HangNotices({ store, api = hangApi(), tickMs = HANG_TICK_MS }: { store: SceneJobs; api?: HangApi; tickMs?: number }) {
  const { jobs } = useJobs(store)
  const [now, setNow] = useState(() => store.now())
  useEffect(() => {
    const t = setInterval(() => setNow(store.now()), tickMs)
    return () => clearInterval(t)
  }, [store, tickMs])
  const hung = jobs.filter((j) => isHung(j, now))
  if (!hung.length) return null
  return <div data-testid="hang-notices">{hung.map((j) => <Notice key={j.id} job={j} store={store} api={api} />)}</div>
}
