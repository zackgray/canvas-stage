import { MAX_PATH_POINTS } from '../../../../../server/stage3d/perf'
import { KitRequestError } from '../../../../labs/projection/stage3d/kitApi'

/** the most points one path holds (the server's limit): drawing stops here with a line, instead of a refused Save */
export { MAX_PATH_POINTS }
export const pathFullLine = `A path holds at most ${MAX_PATH_POINTS} points. Undo a point, or start a new path.`

/** one of the server's refusal lines in plain words: no field names or [x, z] brackets */
function plain(line: string): string {
  const m = /^(.*?)\s*must hold 2 to (\d+) ground points/.exec(line)
  if (m) return `${m[1].replace(/^(hero )?path$/i, 'The hero path').replace(/^extras\[(\d+)\]\.path$/, (_, n) => `Extra ${Number(n) + 1}'s path`)} needs 2 to ${m[2]} points.`
  return line.replace(/^extras\[(\d+)\]\./, (_, n) => `Extra ${Number(n) + 1}: `).replace(/\[(\d+)\]/g, (_, n) => ` point ${Number(n) + 1}`)
}

/** why a Save was refused, from the server's own lines (the generic "not valid" says nothing) */
export function saveReason(e: unknown): string {
  if (e instanceof KitRequestError && e.errors.length) return `Not saved: ${e.errors.slice(0, 3).map(plain).join(' ')}`
  return e instanceof Error ? e.message : String(e)
}
