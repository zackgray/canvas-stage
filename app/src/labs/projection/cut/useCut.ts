import { useCallback, useEffect, useState } from 'react'
import { getCutStatus, getCutTakes, postCut, type CutStatus, type CutTakes } from './api'
import type { CutSegment } from './model'

const POLL_MS = 1500

/** Takes on disk and the export's status. The status is read from the server (disk), so a refresh resumes a running export. */
export function useCut() {
  const [data, setData] = useState<CutTakes | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<CutStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => { setData(await getCutTakes()); setLoaded(true) }, [])
  useEffect(() => {
    let alive = true
    void Promise.all([getCutTakes(), getCutStatus()]).then(([d, s]) => { if (!alive) return; setData(d); setStatus(s); setLoaded(true) })
    return () => { alive = false }
  }, [])

  const running = status?.state === 'running'
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => {
      void getCutStatus().then((s) => { if (!s) return; setStatus(s); if (s.state !== 'running') void reload() })
    }, POLL_MS)
    return () => clearInterval(t)
  }, [running, reload])

  const exportCut = async (packId: string, segments: CutSegment[]) => {
    setError(null)
    const r = await postCut(packId, segments)
    if (r.error) setError(r.error)
    if (r.status) setStatus(r.status)
    else void getCutStatus().then((s) => s && setStatus(s)) // a 409: someone else's export is the truth
  }

  return { data, loaded, status, running, error, exportCut, reload }
}
export type CutController = ReturnType<typeof useCut>
