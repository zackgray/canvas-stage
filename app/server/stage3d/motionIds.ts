// The kept-move ids on disk. Node-only (reads the lab-assets folder): kept apart from perf.ts, whose validator constants the
// browser imports, so the client bundle never pulls node:fs in.
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

/** (track D) the ids of the kept moves under public/lab-assets/motions (a folder holding a clip.json), for the move action's check */
export function knownMotionIds(publicDir: string): string[] {
  const dir = path.join(publicDir, 'lab-assets', 'motions')
  let names: string[]
  try { names = readdirSync(dir) } catch { return [] }
  return names.filter((n) => !n.startsWith('.') && existsSync(path.join(dir, n, 'clip.json'))).map((n) => `gen:${n}`)
}
