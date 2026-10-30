// Guard for the "Bible" sweep: the word Bible (capitalised, whole word) must not reach a user. A static scan, no rendering.
// Scope, by source file, comments excluded (only real string literals, template text and JSX text are read, via the TypeScript parser):
//  - the client: every non-test .ts/.tsx under src/studio;
//  - the strings the server returns to a client: every non-test file under server/l2r, server/hero and server/bible (the l2r status,
//    hero and bible route errors, set-gate refusals), src/shared (the stale-still reasons the server sends, e.g. bibleMovedWhy), and
//    the two validators that reply with a Bible message (server/takes/request.ts, server/stage3d/perf.ts).
// Not scanned, on purpose: test files (test names keep the word), and the other server folders, whose strings are not reasons or errors
// a client shows. Code names (BibleRecord, bible.json, /__lab/bible, bible-master, bible-changed) are lowercase or carry no word boundary,
// so the case-sensitive whole-word match passes them.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const WORD = /\bBible\b/

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) { if (name !== '__tests__' && name !== 'node_modules') walk(p, out); continue }
    if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

const CLIENT = walk(path.join(APP, 'src', 'studio'))
const SERVER = [
  ...['server/l2r', 'server/hero', 'server/bible', 'src/shared'].flatMap((d) => walk(path.join(APP, d))),
  path.join(APP, 'server', 'takes', 'request.ts'),
  path.join(APP, 'server', 'stage3d', 'perf.ts'),
]

// every string literal, template fragment and JSX text node of one file that carries the word, as "file:line: text"
function scan(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const hits: string[] = []
  const visit = (n: ts.Node): void => {
    let text: string | null = null
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isJsxText(n)) text = n.text
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) text = n.text
    if (text !== null && WORD.test(text)) {
      const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
      hits.push(`${path.relative(APP, file).split(path.sep).join('/')}:${line}: ${text.replace(/\s+/g, ' ').trim()}`)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return hits
}

describe('no user-facing "Bible" (track J sweep)', () => {
  it('the scan reaches the files it is meant to', () => {
    const rel = (f: string) => path.relative(APP, f).split(path.sep).join('/')
    expect(CLIENT.map(rel)).toContain('src/studio/scene/BriefEditor.tsx')
    expect(SERVER.map(rel)).toEqual(expect.arrayContaining(['src/shared/bibleContract.ts', 'server/l2r/status.ts', 'server/takes/request.ts']))
    expect(SERVER.map(rel)).not.toContain('src/shared/bibleContract.test.ts')
  })

  it('the studio client shows no "Bible" in a string literal or JSX text', () => {
    expect(CLIENT.flatMap(scan)).toEqual([])
  })

  it('the strings the server returns to a client carry no "Bible"', () => {
    expect(SERVER.flatMap(scan)).toEqual([])
  })
})
