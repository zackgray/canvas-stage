import { useEffect, useState } from 'react'
import { PromptWarnings } from '../PromptWarnings'
import type { PromptPreview } from './l2rExtra'
import type { L2RHook } from './l2rModel'

/**
 * The prompt this Render sends: the one composed from the scene (scene prompt with @tags expanded, the lines, the take's
 * action), shown read-only (PromptSaid, in Advanced); the override that accepts @tag mentions is under Advanced's More
 * (PromptOverride). The override's tags are expanded by the server (the same composePrompt a render calls), so the owner sees the
 * words that will go, and a tag the scene lacks is flagged before spend. Both read one preview (usePromptPreview).
 */
export function usePromptPreview(l: L2RHook): PromptPreview | null {
  const text = l.state.prompt
  const [got, setGot] = useState<{ for: string; p: PromptPreview | null } | null>(null)
  useEffect(() => {
    if (!text.trim()) return
    let live = true
    const t = setTimeout(() => { void l.previewPrompt(text).then((p) => { if (live) setGot({ for: text, p }) }) }, 350)
    return () => { live = false; clearTimeout(t) }
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps -- previewPrompt is a module function
  return got?.for === text ? got.p : null // a preview of older text is not shown
}

/** what this render says, read-only: the composed prompt, or the override as the server expands it */
export function PromptSaid({ l, preview }: { l: L2RHook; preview: PromptPreview | null }) {
  const text = l.state.prompt
  if (!l.state.status?.take) return null
  return (
    <div className="st-l2r-prompt" data-testid="l2r-composed">
      <label className="st-field">
        <span>Prompt this render sends</span>
        <textarea className="st-input" rows={3} readOnly value={text.trim() ? (preview?.text ?? text) : (l.state.status?.prompt ?? '')} data-testid="l2r-composed-text" />
      </label>
      <PromptWarnings warnings={text.trim() ? preview?.warnings : l.state.status?.promptWarnings} testId="l2r-prompt-warnings" />
    </div>
  )
}

/** the owner's own words in place of the composed prompt, with @tags; a tag the scene lacks is said before spend */
export function PromptOverride({ l, preview }: { l: L2RHook; preview: PromptPreview | null }) {
  const text = l.state.prompt
  if (!l.state.status?.take) return null
  return (
    <div className="st-l2r-prompt">
      <label className="st-field">
        <span>Override (empty = the composed prompt; @tags name scene elements)</span>
        <textarea className="st-input" rows={2} value={text} placeholder="e.g. @ana runs through the rain" data-testid="l2r-override" onChange={(e) => l.setPrompt(e.target.value)} />
      </label>
      {preview && preview.unknown.length > 0 && (
        <p className="st-warn" data-testid="l2r-override-unknown">{preview.unknown.map((t) => `@${t}`).join(', ')} {preview.unknown.length > 1 ? 'are' : 'is'} not in this scene: the render will refuse it.</p>
      )}
    </div>
  )
}
