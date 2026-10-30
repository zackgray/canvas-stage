// Browser side of the cast endpoint Scene draws people and creatures through (dev-only middleware, server/cast). No keys here.
// One click = one POST = at most one paid job; nothing re-POSTs. `fetch` is injectable for tests.
//   POST /__lab/cast/candidates {cardId, description, rules, framing?, count}   -> {candidates}   (framing: an edited "How the
//     picture is taken", only when the person maker's box was changed; absent, the server's own head and tail)
// (Scene keeps a drawn face through POST /__lab/cast/keep, in studio/scene/briefApi.ts.)
import type { CardPayload } from '../../../project/model.ts'

export { DEFAULT_RULES, defaultFraming, descriptionProblem, frontCredits, frontPrompt, MIN_CANDIDATES } from '../../../../server/cast/prompts.ts'

type Fetch = (input: string, init?: RequestInit) => Promise<Response>
const URL_ = '/__lab/cast'

export class CastError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function post<T>(route: string, body: unknown, f: Fetch): Promise<T> {
  let res: Response
  try {
    res = await f(`${URL_}/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  } catch (e) {
    throw new CastError(`the request may have reached the server (${e instanceof Error ? e.message : String(e)}); check the jobs list before retrying`, 0)
  }
  const b = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new CastError(res.status === 409 && b.error === 'busy' ? 'a cast job is already running' : (b.error ?? `HTTP ${res.status}`), res.status)
  return b
}

export interface FrontRequest { cardId: string; name?: string; description: string; rules: string; framing?: string; count: number }
export const generateFronts = (r: FrontRequest, f: Fetch = fetch) => post<{ candidates: string[] }>('candidates', r, f)

/** What the project stores for a committed sheet (contract: references = front + face, sheets in view order). */
export const cardPayload = (name: string, description: string, c: { references: string[]; sheets: string[] }): CardPayload =>
  ({ name: name.trim(), description: description.trim(), references: c.references, sheets: c.sheets })
