// Browser side of the take list's routes (server/takes/wordsRoutes.ts): the rows, the words a take may start from, a take's words
// and its name. Every write says so on the page (TAKE_WORDS_CHANGED): the still list reads its staleness again, the takes list and
// Render read the take again, so a changed take prompt refuses a stale first frame exactly as a drawer change does. Free.
import { ROUTES, type TakeRecord } from '../../shared/shotContract'
import { TAKE_WORDS_CHANGED, type TakeBoardResponse, type TakeWordsRequest, type WordsSource, type WordsSourcesResponse } from '../../shared/takeWordsContract'
import { stillChanged } from '../render/l2rStore'
import { HeroApiError } from './heroApi'
import { refreshLockedTakes } from './worldTakes'

async function read<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null) as (T & { error?: string }) | null
  if (!res.ok) throw new HeroApiError(res.status, body?.error ?? `request failed (${res.status})`)
  return body as T
}
const post = (path: string, body: unknown) => fetch(`${ROUTES.takes}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

export async function fetchBoard(worldId: string): Promise<TakeBoardResponse> {
  const b = await read<Partial<TakeBoardResponse> | null>(await fetch(`${ROUTES.takes}/board?world=${encodeURIComponent(worldId)}`, { cache: 'no-store' }))
  // anything but rows (an older server, a page answering for it) is no list, never a broken one
  if (!b || !Array.isArray(b.rows)) throw new HeroApiError(502, 'the take list did not answer')
  return { rows: b.rows, scenePrompt: typeof b.scenePrompt === 'string' ? b.scenePrompt : '' }
}

export const fetchSources = async (takeId: string): Promise<WordsSource[]> =>
  (await read<WordsSourcesResponse>(await fetch(`${ROUTES.takes}/sources?take=${encodeURIComponent(takeId)}`, { cache: 'no-store' }))).sources

/** after any write: everyone who judges a still by the take's words reads again */
async function changed(take: TakeRecord): Promise<TakeRecord> {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(TAKE_WORDS_CHANGED, { detail: take.id }))
  await Promise.all([refreshLockedTakes(), stillChanged()])
  return take
}

export async function writeTakeWords(req: TakeWordsRequest): Promise<TakeRecord> {
  return changed((await read<{ take: TakeRecord }>(await post('/words', req))).take)
}

export async function renameTake(takeId: string, name: string): Promise<TakeRecord> {
  return changed((await read<{ take: TakeRecord }>(await post('/rename', { takeId, name }))).take)
}
