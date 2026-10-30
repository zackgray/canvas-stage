// Test fixtures for the job runner: a fake Cloud (submit / getJob / balance / object_info), temp dirs, no network.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Job } from '@comfyorg/sdk'
import type { ApiGraph, ObjectInfo } from '../../comfy/index.ts'
import { createRuntime, type JobRuntime } from '../runtime.ts'
import type { JobDeps, JobSpec } from '../types.ts'

export const INFO = {
  Gen: { input: { required: { x: ['INT', { min: 0, max: 10 }], lora: [['a.safetensors']] } }, output: ['IMAGE'] },
  Save: { input: { required: { images: ['IMAGE'] } }, output: [] },
} as unknown as ObjectInfo

export const graph = () => ({
  '1': { class_type: 'Gen', inputs: { x: 1, lora: 'a.safetensors' } },
  '2': { class_type: 'Save', inputs: { images: ['1', 0] } },
})

export const HICCUP = { class_type: 'VAELoader', message: 'cannot unpack non-iterable MTPHead object' }

export interface FakeJobOpts { id?: string; status?: string; error?: unknown; wait?: () => Promise<void>; outputs?: number }
export const fakeJob = (o: FakeJobOpts = {}): Job => ({
  id: o.id ?? 'aaaaaaaa-0000-4000-8000-000000000001', status: o.status ?? 'succeeded', error: o.error, metrics: { execution_ms: 12000 },
  wait: o.wait ?? (async () => {}),
  getOutputs: () => Array.from({ length: o.outputs ?? 1 }, () => ({ name: 'out.png', toFile: async (p: string) => writeFileSync(p, 'png') })),
}) as unknown as Job

export interface Rig {
  rt: JobRuntime
  dir: string
  log: string
  out: string
  submits: number
  /** build another runtime over the same disk (a restarted process) */
  restart: (over?: Partial<JobDeps>, cap?: number | null) => JobRuntime
  spec: (o?: Partial<JobSpec>) => JobSpec
  ledger: () => string
}

export function rig(o: { cap?: number | null; jobs?: Job[]; balance?: JobDeps['balance']; getJob?: JobDeps['getJob']; today?: () => string } = {}): Rig {
  const root = mkdtempSync(path.join(tmpdir(), 'jobs-'))
  const dir = path.join(root, 'jobs')
  const t: Rig = { dir, log: path.join(root, 'credit-log.md'), out: path.join(root, 'out'), submits: 0 } as Rig
  const queue = [...(o.jobs ?? [fakeJob()])]
  const deps: JobDeps = {
    submit: async () => { t.submits++; return queue.shift() ?? fakeJob({ id: `aaaaaaaa-0000-4000-8000-00000000${100 + t.submits}` }) },
    getJob: o.getJob ?? (async () => { throw new Error('getJob not expected') }),
    balance: o.balance ?? (async () => null),
    fetchInfo: async () => INFO,
    settleMs: 0, retryMs: 0, bind: () => {},
  }
  const make = (d: JobDeps, cap: number | null) => createRuntime({ deps: d, dir, logPath: t.log, infoFile: path.join(root, 'info.json'), cap: () => cap, today: o.today })
  t.rt = make(deps, o.cap === undefined ? 100 : o.cap)
  t.restart = (over = {}, cap = o.cap === undefined ? 100 : o.cap) => make({ ...deps, ...over }, cap)
  t.spec = (s = {}) => ({ graph: graph(), label: 'test-job', estimateCredits: 20, outputs: { '2': { dir: t.out, name: 'r' } }, ...s })
  t.ledger = () => { try { return readFileSync(t.log, 'utf8') } catch { return '' } }
  return t
}

/** the pid of a process that has already exited (a dev server that died mid-wait) */
export const deadPid = () => spawnSync(process.execPath, ['-e', '0']).pid

/** a promise the test resolves itself: a Cloud job that is still running */
export function gate(): { wait: () => Promise<void>; open: () => void } {
  let open!: () => void
  const p = new Promise<void>((r) => { open = r })
  return { wait: () => p, open }
}

/** a permissive object_info for exactly this graph: classes exist, every set input is accepted, links type-check */
export const permissiveInfo = (g: ApiGraph): ObjectInfo => Object.fromEntries(Object.values(g).map((n) => [n.class_type, {
  input: { required: Object.fromEntries(Object.keys(n.inputs).map((k) => [k, ['*']])) }, output: ['*', '*', '*', '*', '*', '*'],
}])) as unknown as ObjectInfo
