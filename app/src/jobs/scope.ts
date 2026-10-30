// A section's GET says which paid job of that section runs on the server, whichever scene pressed it (one hero job, one render,
// one master draw at a time, process-wide). A screen shows only its own: the job counts here when its description names the take
// (or world) on show, as a word of its own ("a hero still of take-3", "hero-still take-3 hero-…"), never as part of a longer id.
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `what` (a running job's description or runner label) names `id` as a whole word */
export const namesTarget = (what: string | null | undefined, id: string | null | undefined): boolean =>
  !!what && !!id && new RegExp(`(^|\\s)${esc(id)}(\\s|$)`).test(what)

/** the server's running job when it is of `id`, else null (another scene's job is never shown as this one's) */
export const runningOf = <R extends { what: string }>(r: R | null | undefined, id: string | null | undefined): R | null =>
  (r && namesTarget(r.what, id) ? r : null)
