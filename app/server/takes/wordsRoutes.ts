/**
 * The take list's routes (takeWordsContract.ts), under ROUTES.takes; local pages only (server/guard.ts), POSTs are JSON. Free.
 *   GET  /board?world=<worldId>   -> TakeBoardResponse (the world's takes: name, thumbnail, state, words, scene prompt changed)
 *   GET  /sources?take=<takeId>   -> WordsSourcesResponse (every other take's words, every other scene's prompt: copied, never linked)
 *   POST /words  TakeWordsRequest  -> { take } (404 unknown take; 400 bad words)
 *   POST /rename TakeRenameRequest -> { take }
 * A take whose paid still or render runs may still change its words: that still lands judged by the words it was drawn from (stale).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { TAKE_NAME_MAX, TAKE_WORDS_MAX, takeWords, type TakeBoardResponse, type TakeRenameRequest, type TakeWordsRequest, type WordsSource, type WordsSourcesResponse } from '../../src/shared/takeWordsContract.ts'
import { readBibleFile } from '../bible/read.ts'
import { readBody, send } from '../crossview/http.ts'
import { refuseForeign } from '../guard.ts'
import { SceneLibrary } from '../scene/library.ts'
import { TAKE_ID_RE } from './request.ts'
import { listTakes, readTake } from './store.ts'
import { renameTake, setTakeWords, takeBoard, wordsFromScene } from './words.ts'

const BODY_LIMIT = 64 * 1024
const WORLD_RE = /^[\w-]{1,120}$/

/** every other take's words, then every other scene's prompt (hidden scenes and empty prompts left out) */
export function wordsSources(publicDir: string, takeId: string): WordsSource[] {
  const scenes = new SceneLibrary(publicDir).all()
  const sceneOf = (worldId: string) => scenes.find((d) => d.worlds.some((w) => w.id === worldId)) ?? null
  const here = readTake(publicDir, takeId)
  const mine = here ? sceneOf(here.worldId) : null
  const takes: WordsSource[] = listTakes(publicDir).filter((t) => t.id !== takeId).map((t) => ({
    kind: 'take', id: t.id, name: t.name ?? null, scene: sceneOf(t.worldId)?.name ?? null, words: takeWords(t, readBibleFile(publicDir, t.worldId)),
  }))
  const others: WordsSource[] = scenes.filter((d) => !d.hidden && d.worldId && d.id !== mine?.id).flatMap((d) => {
    const words = readBibleFile(publicDir, d.worldId!)?.prompt ?? ''
    return words.trim() ? [{ kind: 'scene' as const, id: d.id, name: d.name, scene: null, words }] : []
  })
  return [...takes.filter((s) => s.words.trim()), ...others]
}

async function json<T>(req: IncomingMessage): Promise<T | string> {
  try { return JSON.parse(await readBody(req, BODY_LIMIT)) as T } catch { return 'body must be JSON' }
}

/** answers a words route; false = not one of these (the caller goes on) */
export async function wordsRoute(req: IncomingMessage, res: ServerResponse, url: URL, publicDir: string): Promise<boolean> {
  if (req.method === 'GET' && url.pathname === '/board') {
    const world = url.searchParams.get('world') ?? ''
    if (!WORLD_RE.test(world)) { send(res, 400, { error: 'world must be a world id' }); return true }
    const body: TakeBoardResponse = takeBoard(publicDir, world)
    send(res, 200, body); return true
  }
  if (req.method === 'GET' && url.pathname === '/sources') {
    const id = url.searchParams.get('take') ?? ''
    if (!TAKE_ID_RE.test(id)) { send(res, 400, { error: 'take must be a take-… id' }); return true }
    const body: WordsSourcesResponse = { sources: wordsSources(publicDir, id) }
    send(res, 200, body); return true
  }
  if (req.method !== 'POST' || (url.pathname !== '/words' && url.pathname !== '/rename')) return false
  const refused = refuseForeign(req, { json: true })
  if (refused) { send(res, refused.status, { error: refused.message }); return true }
  const raw = await json<Partial<TakeWordsRequest & TakeRenameRequest>>(req)
  if (typeof raw === 'string' || !raw || typeof raw.takeId !== 'string' || !TAKE_ID_RE.test(raw.takeId)) {
    send(res, 400, { error: typeof raw === 'string' ? raw : 'takeId must be a take-… id' }); return true
  }
  let take
  if (url.pathname === '/rename') {
    if (typeof raw.name !== 'string') { send(res, 400, { error: 'name must be text' }); return true }
    const name = raw.name.replace(/\s+/g, ' ').trim()
    if (name.length > TAKE_NAME_MAX) { send(res, 400, { error: `the name is longer than ${TAKE_NAME_MAX} characters` }); return true }
    take = renameTake(publicDir, raw.takeId, name)
  } else if (raw.fromScene === true) {
    take = wordsFromScene(publicDir, raw.takeId)
  } else {
    if (typeof raw.prompt !== 'string' || raw.prompt.length > TAKE_WORDS_MAX) { send(res, 400, { error: `prompt must be text of at most ${TAKE_WORDS_MAX} characters` }); return true }
    take = setTakeWords(publicDir, raw.takeId, raw.prompt, raw.rebase === true)
  }
  if (take) send(res, 200, { take }); else send(res, 404, { error: 'no such take' })
  return true
}
