/**
 * Realism ids (docs/chain-contract.md, "Pick order"): `realism-<stamp>`, files `realism-<stamp>.mp4` + `.json` in the warp
 * folder. Finish and Cut import the matcher from here. Pure, browser-safe.
 */
/** the clash suffix is 1-3 digits (as server/reskin/ids.ts): a 4-digit tail like `-1920` is a sibling file, never an id */
export const STAMP = String.raw`\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}(?:-\d{1,3})?`
export const REALISM_ID_RE = new RegExp(`^realism-(${STAMP})$`)
/** the mp4 name of a render, exactly: never matches a sibling like realism-<stamp>-c1.mp4 */
export const REALISM_MP4_RE = new RegExp(`^(realism-${STAMP})\\.mp4$`)
export const isRealismId = (s: string): boolean => REALISM_ID_RE.test(s)
export const realismId = (stamp: string): string => `realism-${stamp}`
