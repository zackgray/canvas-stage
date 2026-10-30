// A small pool of encode workers for a kit clay export (tidy wave, CLAY): the flip, convert and PNG encode of every frame used to
// run on the main thread and froze the page for the whole Prepare. Each read-back is transferred (never copied) to a worker,
// which answers with the PNG. Workers are spawned as the jobs need them and proven with a 1x1 encode before a real buffer is
// sent (a transferred buffer is gone from this side, so a worker that fails to load must fail before it holds one). No Worker
// (the tests, an old browser) or a worker that never comes up: the same encode runs here, with the same bytes (framePack.ts).
import { encodeJob, type EncodeJob } from './framePack'

export interface Encoded { png: Uint8Array; ms: number; on: 'worker' | 'main' }
export interface EncodePool {
  encode(job: EncodeJob): Promise<Encoded>
  /** where the encodes so far ran: 'mixed' when some fell back; undefined before the first */
  where(): 'worker' | 'main' | 'mixed' | undefined
  /** stop the workers; jobs still out are rejected */
  dispose(): void
}

type Reply = { id: number; png?: Uint8Array; ms?: number; error?: string }
export interface WorkerLike {
  postMessage(m: unknown, transfer?: Transferable[]): void
  onmessage: ((e: { data: Reply }) => void) | null
  onerror: ((e: unknown) => void) | null
  terminate(): void
}

/** leave the main thread and the GPU process a core each; at most 4 (each holds a 1920x1088 frame or two) */
export const poolSize = () => Math.max(1, Math.min(4, ((globalThis.navigator?.hardwareConcurrency ?? 4) | 0) - 2))

const defaultSpawn = (): (() => WorkerLike) | null =>
  typeof Worker === 'undefined' ? null : () => new Worker(new URL('./encode.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike

const READY_MS = 5000
const PROBE: EncodeJob = { kind: 'rgb', px: new Uint8Array(4), width: 1, height: 1 }

interface Slot { w: WorkerLike; busy: number; ready: Promise<boolean> }
interface Out { resolve: (e: Encoded) => void; reject: (e: Error) => void; slot: Slot }

async function onMain(job: EncodeJob): Promise<Encoded> {
  const t0 = performance.now()
  const png = await encodeJob(job)
  return { png, ms: performance.now() - t0, on: 'main' }
}

export function openEncodePool(size = poolSize(), spawn: (() => WorkerLike) | null = defaultSpawn()): EncodePool {
  const slots: Slot[] = [], out = new Map<number, Out>(), used = new Set<'worker' | 'main'>()
  let next = 0, broken = !spawn, closed = false
  const fail = (s: Slot, why: string) => {
    broken = true
    for (const [id, o] of out) if (o.slot === s) { out.delete(id); o.reject(new Error(`a frame encode worker stopped: ${why}`)) }
  }
  const open = (): Slot => {
    const w = spawn!()
    let up: (ok: boolean) => void = () => {}
    const ready = new Promise<boolean>((r) => { up = r })
    const s: Slot = { w, busy: 0, ready }
    const timer = setTimeout(() => up(false), READY_MS)
    w.onmessage = ({ data }) => {
      if (data.id === -1) { clearTimeout(timer); return up(!!data.png) }
      const o = out.get(data.id)
      if (!o) return
      out.delete(data.id); s.busy--
      if (data.png) o.resolve({ png: data.png, ms: data.ms ?? 0, on: 'worker' })
      else o.reject(new Error(data.error ?? 'the frame encode failed'))
    }
    w.onerror = (e) => { clearTimeout(timer); up(false); fail(s, e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'worker error') }
    w.postMessage({ id: -1, job: PROBE })
    slots.push(s)
    return s
  }
  const pick = (): Slot => {
    const idle = slots.find((s) => s.busy === 0)
    if (idle) return idle
    if (slots.length < size) return open()
    return slots.reduce((a, b) => (b.busy < a.busy ? b : a))
  }
  return {
    async encode(job) {
      if (closed) throw new Error('the encode pool was closed')
      if (!broken) {
        const s = pick()
        s.busy++ // held while it comes up, so the next job spreads to another worker
        if (await s.ready && !broken && !closed) {
          const id = next++
          const done = new Promise<Encoded>((resolve, reject) => out.set(id, { resolve, reject, slot: s }))
          s.w.postMessage({ id, job }, [job.px.buffer])
          used.add('worker')
          return done
        }
        s.busy--
        broken = true
      }
      used.add('main')
      return onMain(job)
    },
    where: () => (used.size === 2 ? 'mixed' : used.size ? [...used][0] : undefined),
    dispose() {
      closed = true
      for (const s of slots) s.w.terminate()
      for (const [, o] of out) o.reject(new Error('the encode pool was closed'))
      out.clear()
    },
  }
}
