/**
 * Step A of "Draw from your approved frame": the angle's control depth with the performer taken out (free, local). The massing
 * clay is rendered in the page with the performer in it and one export serves every use, so the proven route is the inpaint:
 * scripts/hero/empty_depth.py fills the hero's ID-pass pixels (dilated) from their surroundings and keeps every `prop:` colour.
 * Run through the app's one Python like the colour match (colorMatch.ts). Refused free, in plain words, when the ID pass has no
 * hero colour at the frame, or there is no Python or no script: nothing is spent and nothing is written. Written beside the
 * take's stills as `depth-empty-NNN.png`.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { ClayExport } from '../../src/shared/shotContract.ts'
import type { HeroCtx } from './run.ts'
import { HeroHttpError } from './store.ts'

export const EMPTY_SCRIPT = 'scripts/hero/empty_depth.py'
export const emptyDepthName = (frame: number) => `depth-empty-${String(frame).padStart(3, '0')}.png`

const readJson = <T>(f: string): T | null => { try { return JSON.parse(readFileSync(f, 'utf8')) as T } catch { return null } }
const rgb = (c: readonly number[]) => c.join(',')

/** the ID pass's hero colour and its prop colours at `frame`, with the ID image; a free 409 when the pass cannot say where she is */
export function idPassAt(clayDir: string, frame: number): { id: string; hero: number[]; props: number[][] } {
  const clay = readJson<ClayExport>(path.join(clayDir, 'clay.json'))
  const id = path.join(clayDir, `id_${String(frame).padStart(3, '0')}.png`)
  const colors = clay?.idPass?.colors, hero = colors?.hero
  if (!colors || !hero || !clay?.idPass?.frames.includes(frame) || !existsSync(id)) {
    throw new HeroHttpError(409, 'This draw needs the set\'s ID pass at this frame to take her out of the empty set, and it is not there: lock the take again and press Prepare the frames (free). Nothing was billed.', 'no_id_pass')
  }
  return { id, hero, props: Object.entries(colors).filter(([tag]) => tag.startsWith('prop:')).map(([, c]) => c) }
}

/** Writes `out` (the control depth `depthPng` without the performer) and returns it. */
export async function makeEmptyDepth(ctx: HeroCtx, o: { clayDir: string; frame: number; depthPng: string; out: string }): Promise<string> {
  const ids = idPassAt(o.clayDir, o.frame)
  const python = ctx.deps.python?.()
  const appDir = ctx.deps.appDir ?? path.resolve(ctx.publicDir, '..')
  const script = path.join(appDir, EMPTY_SCRIPT)
  if (!python) throw new HeroHttpError(409, 'Python was not found, and the empty set is made with it. Install Python with OpenCV and numpy (or set CANVAS_PYTHON to it) and restart. Nothing was billed.', 'no_python')
  if (!existsSync(script)) throw new HeroHttpError(409, `${EMPTY_SCRIPT} is not installed. Nothing was billed.`, 'no_python')
  if (!ctx.deps.runPython) throw new HeroHttpError(409, 'No Python runner is set up on this server. Nothing was billed.', 'no_python')
  const args = [script, '--depth', o.depthPng, '--id', ids.id, '--out', o.out, '--hero', rgb(ids.hero), ...ids.props.flatMap((c) => ['--keep', rgb(c)])]
  try {
    await ctx.deps.runPython(python, args)
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e)
    throw new HeroHttpError(409, /ENOENT/.test(msg) ? 'Python was not found, and the empty set is made with it. Nothing was billed.' : `The empty set could not be made (${msg.slice(-200)}). Nothing was billed.`, 'no_python')
  }
  if (!existsSync(o.out)) throw new HeroHttpError(409, 'The empty set was not written. Nothing was billed.', 'no_python')
  return o.out
}
