// A paid job's error line in plain words (QA run 5, F4): the one place the cast, concept, look, still and render presses show a
// job's failure. A Cloud job that finished but left nothing to download used to show the raw line ("job 354d… succeeded but its
// download failed (node s0: no output …); recover by id, do not resubmit"). Here it says what happened and what it cost, and
// offers "Check for the pictures again": the free recover route (POST /__lab/jobs/recover), which fetches the job by id and never
// submits. Trying again is the press that started it, which shows its own price. Any other line shows as it is.
import { useState } from 'react'
import { lineClass } from './sceneJobs'

export type JobFailure = { jobId: string; empty: boolean; credits: number | null }

/** a "succeeded but the download failed" line, read: its job id, whether the cloud returned nothing at all, the billed credits */
export function readJobFailure(line: string | null | undefined): JobFailure | null {
  const m = (line ?? '').match(/job ([\w-]{8,64}) succeeded but (?:its|the) download failed \(([^)]*)\)/)
  if (!m) return null
  const parts = m[2].split(',').map((s) => s.trim()).filter(Boolean)
  const billed = (line ?? '').match(/\(billed ([\d.]+) cr\)/)
  return { jobId: m[1], empty: parts.length > 0 && parts.every((p) => /no output/.test(p)), credits: billed ? Number(billed[1]) : null }
}

/** the plain sentence for a read failure */
export function failureWords(f: JobFailure): string {
  const bill = f.credits !== null ? `you were billed ${f.credits} cr` : 'you may have been billed for it'
  return f.empty
    ? `The cloud finished but returned no pictures. Nothing was saved; ${bill}. Check for the pictures again (free), or press the same button to try again (it shows its price).`
    : `The cloud finished but the pictures did not download. Nothing was lost: check for them again (free); ${bill}.`
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export function JobLine({ line, testId, fetcher = fetch, onRecovered }: { line: string | null | undefined; testId?: string; fetcher?: Fetch; onRecovered?: () => void }) {
  const [state, setState] = useState<{ for: string; busy: boolean; said: string | null }>({ for: '', busy: false, said: null })
  if (!line) return null
  const f = readJobFailure(line)
  if (!f) return <p className={lineClass(line)} role="alert" data-testid={testId}>{line}</p>
  const mine = state.for === f.jobId ? state : { for: f.jobId, busy: false, said: null }
  const check = async () => {
    setState({ for: f.jobId, busy: true, said: null })
    try {
      const res = await fetcher('/__lab/jobs/recover', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jobId: f.jobId }) })
      const b = (await res.json().catch(() => ({}))) as { error?: string }
      if (res.ok) { setState({ for: f.jobId, busy: false, said: 'Found them. They are saved; reload the page if they do not show.' }); onRecovered?.(); return }
      const again = readJobFailure(b.error)
      setState({ for: f.jobId, busy: false, said: again?.empty || /no output/.test(b.error ?? '')
        ? 'Still no pictures on the cloud for this job. Nothing more was billed.' : `Could not fetch them yet. Nothing more was billed. (${(b.error ?? `HTTP ${res.status}`).slice(0, 160)})` })
    } catch {
      setState({ for: f.jobId, busy: false, said: 'Could not reach the app server. Nothing more was billed.' })
    }
  }
  return (
    <div className="st-actions" role="alert" data-testid={testId}>
      <span className="st-warn">{failureWords(f)}</span>
      <button type="button" className="st-btn sc-small" disabled={mine.busy} data-testid={testId ? `${testId}-recover` : undefined}
        title="Fetches the job that was already paid for; it never submits a new one" onClick={() => void check()}>Check for the pictures again</button>
      {mine.said && <span className="st-muted" data-testid={testId ? `${testId}-recovered` : undefined}>{mine.said}</span>}
    </div>
  )
}
