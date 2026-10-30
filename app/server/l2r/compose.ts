/**
 * The Render prompt through the scene Bible. `composePrompt` (server/bible/prompt.ts, track A1) expands @tags and joins the scene
 * prompt, the lines and the take's action; this wraps it for Layout-To-Render:
 *   - the default prompt: the one the world and the cast build today (prompt.ts promptFor) is the fallback a Bible with no prompt
 *     falls back to, and the take's action line joins it. A world with no Bible and a take with no action sends exactly what it did.
 *   - an override: each @tag is replaced once by its card, the one tag rule the default prompt and the draw use (owner 10-29,
 *     prompt/sceneWords.ts); an @tag that matches no element is refused (400, free), never sent; nothing else is added. Otherwise it
 *     is sent exactly as typed: no fire / grain strip and no refusal (owner decision 1, 2026-10-25); the warnings say what those
 *     words do (server/prompt/warn.ts, on the preview and the GET).
 * The app-filled prompt drops none of the words it is built from (stage-only plan, section 5). No camera words are added: the
 * clay video carries the exact camera move (owner 10-29).
 */
import { promptTags, type BibleRecord } from '../../src/shared/bibleContract.ts'
import { DEFAULT_PROJECT } from '../../src/project/model.ts'
import type { TakeRecord } from '../../src/shared/shotContract.ts'
import type { PromptPreview } from '../../src/studio/render/l2rExtra.ts'
import { composePrompt, unknownTagMessage } from '../bible/prompt.ts'
import { castFace } from '../hero/castCard.ts'
import { ProjectStore } from '../project/store.ts'
import { lightingOf } from '../realism/cast.ts'
import { takeKitWorldFor } from '../stage3d/takeKitWorldFor.ts'
// the Bible as the take reads it: its own words are the scene prompt (takes/words.ts)
import { takeBible } from '../takes/words.ts'
import { elementCards, sceneWords } from '../prompt/sceneWords.ts'
import { promptFor } from './prompt.ts'
import { stagedDefault } from './stagedDefault.ts'
import { httpError } from './spec.ts'

/** a Cast card's description by card id, for the cast and creature elements of the Bible (the newest version) */
export async function castDescriptions(publicDir: string, bible: BibleRecord | null): Promise<Record<string, string>> {
  const ids = [...new Set((bible?.elements ?? []).flatMap((e) => (e.cardId ? [e.cardId] : [])))]
  if (!ids.length) return {}
  const project = await new ProjectStore(publicDir).read(DEFAULT_PROJECT).catch(() => null)
  return Object.fromEntries(ids.flatMap((id) => {
    const d = project?.ingredients.cast.find((c) => c.id === id)?.versions.at(-1)?.payload.description
    return d ? [[id, d] as const] : []
  }))
}

/** the prompt a render sends without an override */
export async function defaultPrompt(publicDir: string, take: TakeRecord): Promise<string> {
  const kit = takeKitWorldFor(publicDir, take)
  if (kit) { // the staged cast only, in the LTX guide's shape (stagedDefault.ts)
    const bible = takeBible(publicDir, take)
    const hero = await castFace(publicDir, kit.perf.castId)
    return stagedDefault({ take, kit, bible, hero, descriptions: await castDescriptions(publicDir, bible), worldLighting: lightingOf(publicDir, kit.id) })
  }
  const legacy = await promptFor(publicDir, take)
  const bible = takeBible(publicDir, take)
  const action = take.action?.trim()
  if (!bible && !action) return legacy
  const c = composePrompt({ bible, target: 'video', fallback: legacy, action, castDescriptions: await castDescriptions(publicDir, bible) })
  // M1: never the legacy sentence in place of a scene with an unknown tag (readiness gates the button; this is the backstop)
  if (c.unknown.length) throw httpError(409, `${unknownTagMessage(c.unknown)} Fix it in the Stage's words, or write a prompt override.`, 'unknown_tag')
  const kept = c.text.trim()
  return kept ? (/[.!?]$/.test(kept) ? kept : `${kept}.`) : legacy
}

/**
 * An owner's override as it will be sent (owner decision 1: pasted = verbatim): text with no @tags is returned exactly as typed;
 * each @tag is replaced once by its card (a person's Cast card, a prop's line), later mentions by name, and nothing else is added
 * (no scene prompt, lines or background action line). `unknown` = tags no element answers to.
 */
export async function expandOverride(publicDir: string, take: TakeRecord, text: string): Promise<PromptPreview> {
  const tags = promptTags(text)
  if (!tags.length) return { text, tags: [], unknown: [] }
  const bible = takeBible(publicDir, take)
  if (!bible) return { text, tags: [], unknown: tags }
  const known = new Set(bible.elements.map((e) => e.tag))
  const unknown = tags.filter((t) => !known.has(t))
  if (unknown.length) return { text, tags: tags.filter((t) => known.has(t)), unknown }
  const cards = elementCards(bible.elements, await castDescriptions(publicDir, bible))
  const elements = bible.elements.map((e) => ({ tag: e.tag, kind: e.kind }))
  return { text: sceneWords(text, { elements, cards }), tags, unknown: [] }
}

/** the override as sent: tags expanded, an unknown tag refused (400, free); otherwise verbatim (owner decision 1: no strip, no 400) */
export async function sentOverride(publicDir: string, take: TakeRecord, text: string): Promise<string> {
  const x = await expandOverride(publicDir, take, text.trim())
  if (x.unknown.length) throw httpError(400, `The prompt mentions ${x.unknown.map((t) => `@${t}`).join(', ')}, which this scene's sheet does not have. Add it on the Stage, or take the @ off.`, 'unknown_tag')
  return x.text.trim()
}
