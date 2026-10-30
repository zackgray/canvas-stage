/** The hero still's constants and ids. Pure (the browser imports it for the price). */
export const HERO_W = 1920
export const HERO_H = 1088
export const HERO_KEY = 'hero-still'
export const HERO_LABEL = 'hero-still '
export const isHeroLabel = (label: string): boolean => label.startsWith(HERO_LABEL)
export const heroLabel = (takeId: string, ids: string[]): string => `${HERO_LABEL}${takeId} ${ids.join(' ')}`

/** Distilled Klein 4B stills at 1920x1088: about 2 cr of job overhead plus 1 cr a still (ledger: 1 still 3 cr, 2 stills 4 cr, 6 stills ~8 cr). */
export const HERO_JOB_CREDITS = 2
export const HERO_CREDITS_PER_STILL = 1
export const MAX_SEEDS = 4
export const heroCredits = (count: number): number => HERO_JOB_CREDITS + Math.ceil(HERO_CREDITS_PER_STILL * Math.max(1, count))

export const TAKE_ID_RE = /^take-[\w-]{1,64}$/
export const STILL_ID_RE = /^hero-[\w-]{1,48}$/
export const MAX_PROMPT = 4000
export const MAX_OPENING_BYTES = 40 * 1024 * 1024

/** The loader node ids in the graph (graph.ts) and the save node of one still. */
export const NODES = { opening: 'a', face: 'f' } as const
export const saveNode = (stillId: string): string => `o_${stillId.replace(/[^\w]/g, '_')}`
