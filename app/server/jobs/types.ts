/** Shared shapes for the job runner (server/jobs). Server-side only. */
import type { Job, Workflow } from '@comfyorg/sdk'
import type { ApiGraph, ObjectInfo } from '../comfy/index.ts'

export type { ApiGraph }

/** Where one output node's files go: `<dir>/<name>[-<i>]<server extension>`. Serialisable, so recovery can reuse it. */
export interface OutputTarget { dir: string; name: string }

export interface JobSpec {
  graph: ApiGraph
  /** shown in the ledger "workflow" column and the jobs list */
  label: string
  /** credits this job is expected to cost; refused when spent-today + estimate passes the day cap */
  estimateCredits: number
  /** output node id -> where its files are written */
  outputs: Record<string, OutputTarget>
  /** local files bound to loader inputs, uploaded on submit: [node, field, absolute path]; checked to exist before any spend */
  binds?: [string, string, string][]
  /** per-user model names (e.g. a LoRA) missing from shared object_info: validation errors naming them are ignored */
  allowModels?: string[]
  /** free text for the ledger note */
  note?: string
  /** wait cap per attempt (default 30 min) */
  timeoutMs?: number
}

export type JobStatus = 'submitting' | 'waiting' | 'needs-recover' | 'done' | 'failed'
/** states that still need an eye: a lost wait, a failed download, a job in the air */
export const OPEN: JobStatus[] = ['submitting', 'waiting', 'needs-recover']

export interface AttemptRec { jobId: string; status: string; execSeconds: number | null; deltaCents: number | null }

export interface JobRecord {
  id: string
  label: string
  status: JobStatus
  /** the latest submitted job id (absent while `submitting`: a crash there means check Cloud history, never resubmit) */
  jobId?: string
  attempts: AttemptRec[]
  estimateCredits: number
  /** settled cost of the final attempt (null = not measured) */
  costCents: number | null
  costCredits: number | null
  execSeconds: number | null
  /** other jobs were in the air at submit: the balance delta may be blurred */
  overlapped?: boolean
  /** the server process that submitted it: a `waiting` record whose process is gone is not running (server/jobs/inflight.ts) */
  pid?: number
  outputs: Record<string, OutputTarget>
  saved: string[]
  error?: string
  recovered?: boolean
  /** Cloud finished 'succeeded' with no output files: nothing to download or recover, never offered Recover (status is `failed`) */
  empty?: boolean
  createdAt: string
  updatedAt: string
}

export interface JobResult {
  id: string
  jobId: string
  status: 'done'
  attempts: number
  costCents: number | null
  costCredits: number | null
  execSeconds: number | null
  saved: string[]
}

export type JobErrorCode = 'unconfigured' | 'invalid' | 'inputs' | 'budget' | 'left' | 'submit' | 'failed' | 'recover' | 'empty'
/** what the owner reads when Cloud finished a job with no output files */
export const EMPTY_MESSAGE = 'The drawing came back empty. Nothing was saved. Try again.'
/** refusals before anything was submitted: nothing is billed, so a route removes the intents it wrote for the job */
export const FREE_CODES: readonly JobErrorCode[] = ['budget', 'invalid', 'inputs', 'unconfigured', 'left']
/** a refusal that spent nothing (no Cloud job exists) */
export const isFreeRefusal = (e: unknown): e is JobError => e instanceof JobError && !e.jobId && FREE_CODES.includes(e.code)

/** Every refusal or failure the runner throws; `status` is a ready HTTP code, `jobId` is set once Cloud knows the job. */
export class JobError extends Error {
  readonly code: JobErrorCode
  readonly status: number
  readonly jobId?: string
  readonly recordId?: string
  constructor(code: JobErrorCode, message: string, status = 502, jobId?: string, recordId?: string) {
    super(message)
    this.code = code
    this.status = status
    this.jobId = jobId
    this.recordId = recordId
  }
}

export interface JobDeps {
  submit: (wf: Workflow) => Promise<Job>
  /** fetch an existing job by id (never submits) */
  getJob: (jobId: string) => Promise<Job>
  balance: () => Promise<number | null>
  fetchInfo: () => Promise<ObjectInfo>
  /** delay before the balance re-read that settles cost (charges post late) */
  settleMs: number
  /** wait before an MTPHead resubmit */
  retryMs: number
  /** binds a local file to a loader input (default: SDK lazy asset; tests record instead) */
  bind?: (wf: Workflow, node: string, field: string, file: string) => void
}
