// A prop draw's ADVANCED boxes (prop-draw-parts, owner 2026-10-29: "the character works great, apply it to the props"): the
// person card's own PromptBox and layout — (prop-advanced-same, owner 2026-10-29: "looks completely different") one large
// 'How the picture is taken' box holding the product-photo setup and its light, the way the person card holds its framing, with a
// small View box above it (the part props need most) and a small 'Nothing else in the picture' box under it (the person card's
// short-line box), each with its hint and Reset, then the same 'What will be sent' line. Each shows the app's real default
// (server/scene/conceptText.ts propPartDefaults), is held as typed, clears for real, and changes only its own part. A side view
// stated in Describe it or in the View box is sent with the firm side-view words (said under the box). The Add dialog and the
// prop card use this one component. Free.
import type { PropParts } from '../../../shared/sceneContract'
import { conceptPrompt, propPartDefaults, statesSide, statesView } from '../../../../server/scene/conceptText.ts'
import { PromptBox } from './PromptBox'
import { SentLine } from './SentLine'

export const NO_LOGOS = 'no logos or printed text'

/** the parts with some changed (undefined = back to its default; an empty record is no edit at all) */
const withParts = (p: PropParts, ch: PropParts): PropParts => {
  const next = { ...p }
  for (const k of Object.keys(ch) as (keyof PropParts)[]) { if (ch[k] === undefined) delete next[k]; else next[k] = ch[k] }
  return next
}
/** two parts as one box's text, the way they are sent (', ' between, an empty one left out) */
const joined = (...t: string[]) => t.map((s) => s.trim().replace(/[.,;\s]+$/, '')).filter(Boolean).join(', ')

function viewHint(description: string, view: string | undefined): string {
  if (statesSide(description)) return 'Describe it asks for a side view, so the firm side-view words are written here.'
  if (statesView(description)) return 'Describe it states the view, so the default view is left out.'
  if (view !== undefined && statesSide(view)) return 'A side view: the firm side-view words are added after yours when it is sent.'
  return 'Side, top-down, front, rear, low angle… stated here or in Describe it.'
}

export function PropDrawParts({ description, parts, onChange, testId = 'prop-part' }: {
  /** the prop's own words as the draw sends them (Describe it, or the card's What it is) */
  description: string
  parts: PropParts
  onChange: (p: PropParts) => void
  testId?: string
}) {
  const def = propPartDefaults(description, parts)
  const set = (ch: PropParts) => onChange(withParts(parts, ch))
  const rules = parts.rules ?? def.rules
  // the setup and its light are one box: an edit holds the whole text as the setup (the light then adds nothing), Reset gives both back
  const framing = parts.setup !== undefined || parts.light !== undefined ? joined(parts.setup ?? def.setup, parts.light ?? def.light) : undefined
  return (
    <div data-testid={`${testId}s`}>
      <PromptBox label="View" value={parts.view} def={def.view} rows={2} testId={`${testId}-view`} onChange={(v) => set({ view: v })}
        hint={viewHint(description, parts.view)} />
      <PromptBox label="How the picture is taken" value={framing} def={joined(def.setup, def.light)} rows={6} testId={`${testId}-setup`}
        onChange={(v) => set(v === undefined ? { setup: undefined, light: undefined } : { setup: v, light: '' })}
        hint={def.light ? 'Used for every new picture of this prop: a plain backdrop and flat, even light, so the 3D build reads the shape. Change only if pictures come out wrong.'
          : 'Used for every new picture of this prop. Describe it states the light, so the default light is left out. Change only if pictures come out wrong.'} />
      <PromptBox label="Nothing else in the picture" value={parts.rules} def={def.rules} rows={2} testId={`${testId}-rules`} onChange={(v) => set({ rules: v })}
        hint="What must not be in the picture, so the 3D build gets the prop alone. Clear it to drop the line from the prompt."
        extra={!rules.toLowerCase().includes('logo') && (
          <button type="button" className="st-btn" style={{ marginLeft: 8 }} data-testid={`${testId}-nologos`}
            onClick={() => set({ rules: rules.trim() ? `${rules.trim().replace(/[.,;\s]+$/, '')}, ${NO_LOGOS}` : NO_LOGOS })}>Add no logos, no printed text</button>
        )} />
      {description.trim() && <SentLine testId={`${testId}-sent`} text={conceptPrompt('prop', { description, parts })} />}
    </div>
  )
}
