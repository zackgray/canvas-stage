// The free, local warning on one typed change for "Edit this frame" (the FINDINGS offer/warn list of the qwen-abilities test):
// camera moves and zoom-outs do not work (the Stage sets the camera), re-posing a person changes how they look. Warn-only, like the
// paste-camera note (promptWarn.ts) — the sentence goes as typed; the note only tells. Plain regexes, no AI.
import { cameraPhrases } from './promptWarn'

const ZOOM_RULES: RegExp[] = [/\bzoom(?:ing)?\s*(?:in|out)?\b/gi, /\b(?:widen|wider|pull\s+back|step\s+back)\b/gi]
const POSE_RULES: RegExp[] = [/\b(?:re-?pos\w*|posture|stance)\b/gi]

const hits = (text: string, rules: RegExp[]): boolean => rules.some((r) => { r.lastIndex = 0; return r.test(text) })

/** the note under the edit box for this sentence, or null when nothing of it warns (pure) */
export function frameEditWarning(text: string): string | null {
  if (!text.trim()) return null
  if (cameraPhrases(text).length > 0 || hits(text, ZOOM_RULES)) {
    return 'Camera moves, zooms and a wider frame do not work in an edit — the Stage sets the camera. Light, colour, weather and small things work.'
  }
  if (hits(text, POSE_RULES)) return 'Re-posing a person works, but the person may come back looking different: check them before you approve the frame.'
  return null
}
