/**
 * Reskin ids, as docs/chain-contract.md ("Pick order") fixes them. Finish's SOURCE_RE and Cut's id matcher import these
 * (the join wires it): a reskin render exists when `reskin-<stamp>.json` exists; Cut and Finish PLAY the 1920 file, not
 * the 1248 stitch artefact, and the chunk files (`-c1.mp4`, ...) and `-reference.png` beside it are never ids.
 * Pure, browser-safe: no node imports.
 */
/** `2026-10-21T14-02-33-123`, with a `-2`, `-3` ... suffix on a name clash (chain-contract.md, "Render folder"). */
export const STAMP_PATTERN = String.raw`\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}(?:-\d{1,3})?`

/** A reskin render id: `reskin-<stamp>` and nothing else (not `reskin-<stamp>-c1`, not `-1920`, not `-reference`). */
export const RESKIN_ID_RE = new RegExp(String.raw`^reskin-${STAMP_PATTERN}$`)
/** The mp4 that names a reskin render by exact name (the 1248 stitch); group 1 is the id. */
export const RESKIN_MP4_RE = new RegExp(String.raw`^(reskin-${STAMP_PATTERN})\.mp4$`)
/** The playback file (the lanczos 1920 version, what Finish and Cut read); group 1 is the id. */
export const RESKIN_1920_RE = new RegExp(String.raw`^(reskin-${STAMP_PATTERN})-1920\.mp4$`)

export const isReskinId = (s: unknown): s is string => typeof s === 'string' && RESKIN_ID_RE.test(s)

/** What Finish and Cut read and play for a reskin id. */
export const reskinPlaybackFile = (id: string): string => `${id}-1920.mp4`

/** Source ids a reskin may start from: a Realism render or a CrossView final. */
export const RESKIN_SOURCE_RE = new RegExp(String.raw`^(?:realism|final)-${STAMP_PATTERN}$`)
export const isReskinSource = (s: unknown): s is string => typeof s === 'string' && RESKIN_SOURCE_RE.test(s)
