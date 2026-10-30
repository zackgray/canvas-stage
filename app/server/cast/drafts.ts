/**
 * Cast drafts on disk. Everything paid for a character lands in public/lab-assets/cast/<cardId>/draft/ (the front
 * candidates); draft.json beside them keeps what was asked ({ cardId, name, description, rules, pick, updatedAt }).
 */
import { readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface DraftMeta { cardId: string; name: string | null; description: string | null; rules: string | null; pick: number | null; updatedAt: string }

export const castRoot = (publicDir: string) => path.join(publicDir, 'lab-assets', 'cast')
const draftDir = (publicDir: string, card: string) => path.join(castRoot(publicDir), card, 'draft')
export function readMeta(publicDir: string, card: string): DraftMeta | null {
  try { return JSON.parse(readFileSync(path.join(draftDir(publicDir, card), 'draft.json'), 'utf8')) as DraftMeta } catch { return null }
}

/** Merges `patch` into draft.json (atomic). */
export async function writeMeta(publicDir: string, card: string, patch: Partial<DraftMeta>): Promise<void> {
  const dir = draftDir(publicDir, card)
  await mkdir(dir, { recursive: true })
  const prev = readMeta(publicDir, card) ?? { cardId: card, name: null, description: null, rules: null, pick: null, updatedAt: '' }
  const file = path.join(dir, 'draft.json')
  await writeFile(`${file}.tmp`, JSON.stringify({ ...prev, ...patch, cardId: card, updatedAt: new Date().toISOString() }, null, 2) + '\n')
  await rename(`${file}.tmp`, file)
}
