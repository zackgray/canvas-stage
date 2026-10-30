/**
 * The one label-stripper every app-filled prompt uses (F2, prompt-wave fix pass): the render (server/l2r/prompt.ts, stagedDefault.ts)
 * and the no-brief still and master (server/hero/kitStillPrompt.ts). Pure.
 */
/**
 * The Guided stepper's template labels out of scene text ("Set in X", "Cast: @a.", "Materials: @m, …", "Beats: …"; run 1 sent them as
 * prose), and, when people are on the set, a bare "no people" clause that would contradict them. B2 stops writing them; this keeps
 * older Bibles from echoing them.
 */
export function unlabel(text: string, people = false): string {
  let t = text.replace(/(^|[.!?]\s+)Set in\s+/g, '$1').replace(/(^|[.!?]\s+)(Cast|Materials|Beats|Lighting|Background):\s*/g, '$1')
  if (people) {
    const kept: string[] = []
    for (const c of t.split(/(?<=[,;.])\s+/)) {
      if (!/^no (other )?(people|person|one|figures?)[,;.]?$/i.test(c.trim())) { kept.push(c); continue }
      if (/\.$/.test(c.trim()) && kept.length) kept.push(kept.pop()!.replace(/[,;]$/, '.')) // the sentence it ended still ends
    }
    t = kept.join(' ')
  }
  return t.replace(/\s{2,}/g, ' ').trim()
}
