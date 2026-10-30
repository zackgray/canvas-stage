/**
 * The cast endpoint's logic, free of HTTP so tests drive it directly. Every paid call goes through runJob.
 *   POST candidates  {cardId, name?, description, rules?, framing?, count?}  -> {candidates: url[]}  one job (Z-Image Turbo, N
 *                       seeds); `framing`, the person maker's edited "How the picture is taken", replaces the head and tail
 *   POST keep        {cardId, from}                          -> {url}  free: a copy of an image already under /lab-assets/ (a front
 *                       Scene drew, an upload) as the card's own face file, kept/face-N.<ext>, never overwritten; the card a
 *                       Scene tile saves points at it, so no later draw, discard or new scene can take its face away
 * Files: public/lab-assets/cast/<cardId>/draft/ (cand-N.png, draft.json) and /kept/. A new candidates draw moves the previous
 * candidates into /earlier/ (never deleted: they were paid for) before it writes cand-1..N again, so pick numbers stay 1..N.
 */
import { constants as FS, copyFile, mkdir, readdir, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { BusyError, exclusive as oneJob, JobError, runJob, type JobRuntime } from '../jobs/index.ts'
import { writeMeta } from './drafts.ts'
import { redact } from '../stills/ledger.ts'
import { frontGraph } from './graphs.ts'
import {
  DEFAULT_CANDIDATES, DEFAULT_RULES, frontCredits, MAX_CANDIDATES, MIN_CANDIDATES,
  descriptionProblem, framingProblem, frontPrompt, rulesProblem,
} from './prompts.ts'

export const CARD_ID_RE = /^[a-z0-9][a-z0-9-]{0,40}$/
export interface CastCtx { publicDir: string; rt: () => JobRuntime; seed?: () => number }
export interface Reply { status: number; body: unknown }
const reply = (status: number, body: unknown): Reply => ({ status, body })
const bad = (error: string) => reply(400, { error })

const urlOf = (card: string, dir: string, view: string) => `/lab-assets/cast/${card}/${dir}/${view}.png`

/** The runner's key and label match for Cast (server/jobs/inflight.ts). */
export const CAST_KEY = 'cast'
export const isCastLabel = (label: string) => /^cast_(front|sheet|view) /.test(label)

export function createCast(ctx: CastCtx) {
  const seed = ctx.seed ?? (() => 1 + Math.floor(Math.random() * 900_000_000))
  const cardDir = (card: string) => path.join(ctx.publicDir, 'lab-assets', 'cast', card)

  /** one paid action at a time; a second click while a job runs is refused, not queued - also after a restart */
  async function exclusive(fn: () => Promise<Reply>): Promise<Reply> {
    try { return await oneJob(CAST_KEY, 'a Cast job', ctx.rt().store, isCastLabel, fn) } catch (e) {
      if (e instanceof BusyError) return reply(409, { error: 'busy' })
      if (e instanceof JobError) return reply(e.status, { error: redact(e.message), ...(e.jobId ? { jobId: e.jobId } : {}) })
      return reply(500, { error: redact(e instanceof Error ? e.message : String(e)) })
    }
  }

  async function candidates(b: Record<string, unknown>): Promise<Reply> {
    const card = String(b.cardId ?? '')
    if (!CARD_ID_RE.test(card)) return bad('bad card id')
    const description = typeof b.description === 'string' ? b.description : ''
    const rules = typeof b.rules === 'string' ? b.rules : DEFAULT_RULES
    const framing = typeof b.framing === 'string' ? b.framing : undefined
    const problem = descriptionProblem(description) ?? rulesProblem(rules) ?? (framing === undefined ? null : framingProblem(framing))
    if (problem) return bad(problem)
    const count = b.count === undefined ? DEFAULT_CANDIDATES : Number(b.count)
    if (!Number.isInteger(count) || count < MIN_CANDIDATES || count > MAX_CANDIDATES) return bad(`count must be ${MIN_CANDIDATES} to ${MAX_CANDIDATES}`)
    return exclusive(async () => {
      const dir = path.join(cardDir(card), 'draft')
      const base = seed()
      const seeds = Array.from({ length: count }, (_, k) => base + k)
      await mkdir(dir, { recursive: true })
      await keepEarlier(card, dir)
      const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) || null : null
      await writeMeta(ctx.publicDir, card, { name, description, rules, pick: null }) // before the spend: resumable after a refresh
      await runJob(ctx.rt(), {
        graph: frontGraph(frontPrompt(description, rules, framing), seeds), label: `cast_front ${card} x${count}`,
        estimateCredits: frontCredits(count), note: `cast front candidates for ${card}`,
        outputs: Object.fromEntries(seeds.map((_, k) => [`s${k}`, { dir, name: `cand-${k + 1}` }])),
      })
      return reply(200, { candidates: seeds.map((_, k) => urlOf(card, 'draft', `cand-${k + 1}`)) })
    })
  }

  /** the previous candidates out of the way, never deleted (M3): <card>/earlier/<stamp>-cand-N.png, outside the draft discard removes */
  async function keepEarlier(card: string, dir: string) {
    const old = (await readdir(dir)).filter((f) => /^cand-\d+\.png$/.test(f))
    if (!old.length) return
    const to = path.join(cardDir(card), 'earlier')
    await mkdir(to, { recursive: true })
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 17)
    for (const f of old) await rename(path.join(dir, f), path.join(to, `${stamp}-${f}`))
  }

  /** free: an image under /lab-assets/ copied as the card's own face file (never overwritten); M1, a card saved from a Scene tile */
  async function keep(b: Record<string, unknown>): Promise<Reply> {
    const card = String(b.cardId ?? '')
    if (!CARD_ID_RE.test(card)) return bad('bad card id')
    const from = typeof b.from === 'string' ? b.from.split('?')[0] : ''
    const ext = /\.(png|jpe?g|webp)$/i.exec(from)?.[1].toLowerCase().replace('jpeg', 'jpg')
    const root = path.resolve(ctx.publicDir, 'lab-assets')
    const src = path.resolve(ctx.publicDir, from.replace(/^\/+/, ''))
    if (!from.startsWith('/lab-assets/') || !ext || from.split('/').includes('..') || !src.startsWith(root + path.sep)) return bad('from must be an image under /lab-assets/')
    if (!existsSync(src)) return reply(404, { error: 'that image is not on disk' })
    const dir = path.join(cardDir(card), 'kept')
    await mkdir(dir, { recursive: true })
    for (let n = 1; n < 10_000; n++) {
      const name = `face-${n}.${ext}`
      try { await copyFile(src, path.join(dir, name), FS.COPYFILE_EXCL) } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'EEXIST') continue
        throw e
      }
      return reply(200, { url: `/lab-assets/cast/${card}/kept/${name}` })
    }
    return reply(507, { error: 'too many kept faces' })
  }

  return async (method: string, route: string, body: Record<string, unknown>): Promise<Reply> => {
    if (method !== 'POST') return reply(405, { error: 'POST only' })
    switch (route) {
      case 'candidates': return candidates(body)
      case 'keep': return keep(body)
      default: return reply(404, { error: 'no such route' })
    }
  }
}
