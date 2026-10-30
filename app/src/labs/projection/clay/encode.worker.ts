// A kit clay frame's PNG encode off the main thread (encodePool.ts): the read-back arrives transferred, the PNG goes back
// transferred, with the time the encode took here. framePack.ts is the whole of the work; this is only the message seam.
import { encodeJob, type EncodeJob } from './framePack'

interface Port { onmessage: ((e: MessageEvent<{ id: number; job: EncodeJob }>) => void) | null; postMessage(m: unknown, transfer?: Transferable[]): void }
const port = self as unknown as Port

port.onmessage = (e) => {
  const { id, job } = e.data
  const t0 = performance.now()
  encodeJob(job).then(
    (png) => port.postMessage({ id, png, ms: performance.now() - t0 }, [png.buffer]),
    (err: unknown) => port.postMessage({ id, error: err instanceof Error ? err.message : String(err) }),
  )
}
