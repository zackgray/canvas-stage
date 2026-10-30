import { describe, expect, it } from 'vitest'
import { getProject, postVersion, saveProject, StaleRevisionError } from '../api.ts'
import { LOOK, project } from './fixture.ts'

const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('project api', () => {
  it('a missing project is null, not an error', async () => {
    expect(await getProject('default', reply(404, { error: 'no such project' }))).toBeNull()
  })

  it('a 409 is a StaleRevisionError carrying the stored revision', async () => {
    const err = await saveProject(project(), reply(409, { error: 'stale revision 0: the project is at 3', revision: 3 })).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(StaleRevisionError)
    expect((err as StaleRevisionError).revision).toBe(3)
    await expect(saveProject(project(), reply(400, { error: 'shots[0].id: bad' }))).rejects.toThrow('shots[0].id: bad')
  })

  it('posts a version as JSON to the project\'s ingredient route', async () => {
    let seen: { url: string; init?: RequestInit } | null = null
    const f = async (url: string, init?: RequestInit) => { seen = { url, init }; return reply(200, project())() }
    await postVersion('test', 'look', 'loc-1', LOOK, 'Wet night', f)
    expect(seen!.url).toBe('/__lab/project/test/ingredient')
    expect(seen!.init?.headers).toEqual({ 'content-type': 'application/json' })
    expect(JSON.parse(seen!.init?.body as string)).toEqual({ kind: 'look', id: 'loc-1', payload: LOOK, name: 'Wet night' })
  })
})
