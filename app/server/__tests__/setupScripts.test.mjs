// The pure parts of scripts/preflight.mjs and scripts/import-lora.mjs, with everything injected (no disk, no network).
import { describe, expect, it } from 'vitest'
import { parseBudget, parseEnv, loadEnv } from '../../../scripts/lib/env.mjs'
import * as P from '../../../scripts/lib/preflightChecks.mjs'
import { GATED_HELP, describeRequest, importLora } from '../../../scripts/lib/loraImport.mjs'

const KEY = ['comfy', 'ui-', 'abc123'].join('') // built so no key-shaped literal sits in the source
const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body })
const ctx = (over = {}) => ({ env: {}, fileFound: true, fs: { existsSync: () => true, readFileSync: () => '{}' }, run: () => ({ ok: true, out: '' }), fetch: async () => json(200, {}), version: 'v22.12.0', platform: 'linux', root: '/r', ...over })

describe('env parsing', () => {
  it('reads KEY=value, quotes and comments', () => {
    expect(parseEnv('# c\nA=1\nB="two words"\nC=x # tail\nexport D=4\n\nE=')).toEqual({ A: '1', B: 'two words', C: 'x', D: '4', E: '' })
  })
  it('the process wins over the file', () => {
    const fs = { existsSync: () => true, readFileSync: () => 'COMFY_API_KEY=file\nCANVAS_DAY_BUDGET=300' }
    expect(loadEnv({ fs, file: 'x', proc: { COMFY_API_KEY: 'proc' } }).env).toMatchObject({ COMFY_API_KEY: 'proc', CANVAS_DAY_BUDGET: '300' })
  })
  it('budget parses like the app', () => {
    expect([parseBudget('300'), parseBudget(' 2.5 '), parseBudget(''), parseBudget('0'), parseBudget('abc'), parseBudget(undefined)]).toEqual([300, 2.5, null, null, null, null])
  })
})

describe('preflight checks', () => {
  it('Node: 22.12 passes, older fails with a fix', () => {
    expect(P.checkNode(ctx({ version: 'v22.12.0' })).status).toBe('ok')
    expect(P.checkNode(ctx({ version: 'v24.1.0' })).status).toBe('ok')
    expect(P.checkNode(ctx({ version: 'v22.11.9' })).status).toBe('fail')
    expect(P.checkNode(ctx({ version: 'v20.18.0' })).fix).toMatch(/22\.12/)
  })
  it('ffmpeg missing fails', () => {
    expect(P.checkTool(ctx({ run: () => ({ ok: false, out: '' }) }), 'ffprobe')).toMatchObject({ status: 'fail', name: 'ffprobe' })
    expect(P.checkTool(ctx(), 'ffmpeg').status).toBe('ok')
  })
  it('.env and key presence', () => {
    expect(P.checkEnvFile(ctx({ fileFound: false })).status).toBe('fail')
    expect(P.checkKeySet(ctx()).status).toBe('fail')
    expect(P.checkKeySet(ctx({ env: { COMFY_API_KEY: 'nope' } })).status).toBe('warn')
    expect(P.checkKeySet(ctx({ env: { COMFY_API_KEY: KEY } })).status).toBe('ok')
  })
  it('the key test: 200 ok with balance, 401 and network failure fail', async () => {
    const env = { COMFY_API_KEY: KEY }
    const ok = await P.checkKeyWorks(ctx({ env, fetch: async () => json(200, { effective_balance_cents: 100 }) }))
    expect(ok.status).toBe('ok')
    expect(ok.msg).toContain('211')
    expect((await P.checkKeyWorks(ctx({ env, fetch: async () => json(401, {}) }))).msg).toContain('refused')
    expect((await P.checkKeyWorks(ctx({ env, fetch: async () => { throw new Error('ENOTFOUND') } }))).msg).toContain('could not reach')
    expect((await P.checkKeyWorks(ctx({ env: {} }))).status).toBe('fail')
    expect((await P.checkKeyWorks(ctx({ env: { ...env, COMFY_BASE_URL: 'http://x' } }))).status).toBe('info')
  })
  it('the key is sent only in the header', async () => {
    let seen
    await P.checkKeyWorks(ctx({ env: { COMFY_API_KEY: KEY }, fetch: async (url, init) => { seen = { url, init }; return json(200, {}) } }))
    expect(seen.url).not.toContain(KEY)
    expect(seen.init.headers['X-API-Key']).toBe(KEY)
  })
  it('budget: unset fails, small warns, 300 ok', () => {
    expect(P.checkBudget(ctx()).status).toBe('fail')
    expect(P.checkBudget(ctx({ env: { CANVAS_DAY_BUDGET: '100' } })).status).toBe('warn')
    const ok = P.checkBudget(ctx({ env: { CANVAS_DAY_BUDGET: '300' } }))
    expect(ok.status).toBe('ok')
    expect(ok.msg).toContain('300 credits per day')
  })
  it('python: the Windows Store stub is flagged', () => {
    const run = (cmd) => (cmd === 'where' ? { ok: true, out: 'C:\\Users\\a\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe\r\n' } : { ok: true, out: '{}' })
    const r = P.checkPython(ctx({ platform: 'win32', run }))
    expect(r.status).toBe('fail')
    expect(r.msg).toContain('Store stub')
  })
  it('python: needs cv2 + numpy; trimesh and friends only warn', () => {
    const py = (have) => ctx({ env: { CANVAS_PYTHON: '/v/bin/python' }, run: () => ({ ok: true, out: JSON.stringify(have) }) })
    const all = { cv2: true, numpy: true, trimesh: true, scipy: true, skimage: true }
    expect(P.checkPython(py(all)).status).toBe('ok')
    expect(P.checkPython(py({ ...all, cv2: false })).status).toBe('fail')
    expect(P.checkPython(py({ ...all, scipy: false })).status).toBe('warn')
    expect(P.checkPython(ctx({ env: { CANVAS_PYTHON: '/v/bin/python' }, run: () => ({ ok: false, out: '' }) })).status).toBe('fail')
    expect(P.checkPython(ctx({ env: { CANVAS_PYTHON: '/gone/python' }, fs: { existsSync: () => false } })).status).toBe('fail')
  })
  it('sample scene: registered or not', () => {
    const fsWith = (shots) => ({ existsSync: () => true, readFileSync: (f) => (String(f).includes('manifest-shot') ? '{"id":"loc-1"}' : JSON.stringify({ shots })) })
    expect(P.checkSample(ctx({ fs: fsWith([{ id: 'loc-1' }]) })).status).toBe('ok')
    expect(P.checkSample(ctx({ fs: fsWith([]) })).status).toBe('fail')
  })
  it('the LoRA is never claimed verified', () => {
    const l = P.checkLora(ctx())
    expect(l.status).toBe('info')
    expect(l.fix).toContain('import-lora')
  })
  it('format: exits 1 on any failure and prints the fix', () => {
    const out = P.format([{ name: 'a', status: 'ok', msg: 'fine' }, { name: 'b', status: 'fail', msg: 'bad', fix: 'do x' }])
    expect(out.code).toBe(1)
    expect(out.text).toContain('FAIL  b: bad')
    expect(out.text).toContain('-> do x')
    expect(P.format([{ name: 'a', status: 'warn', msg: 'm', fix: 'f' }]).code).toBe(0)
  })
})

describe('import-lora', () => {
  const sleep = async () => {}
  it('dry run shows the request without a key', () => {
    const d = describeRequest()
    expect(d.url).toBe('https://cloud.comfy.org/api/assets/download')
    expect(JSON.stringify(d)).not.toContain(KEY)
    expect(d.body.tags).toEqual(['models', 'loras'])
  })
  it('polls until completed, then says ready', async () => {
    const calls = []
    const seq = [json(202, { id: 't1' }), json(200, { status: 'running' }), json(200, { status: 'completed' })]
    const fetchFn = async (url, init) => { calls.push([url, init?.method ?? 'GET', init?.headers?.['X-API-Key']]); return seq.shift() }
    const res = await importLora({ key: KEY, fetchFn, sleep })
    expect(res).toEqual({ ok: true, message: 'LoRA ready' })
    expect(calls[0].slice(0, 2)).toEqual(['https://cloud.comfy.org/api/assets/download', 'POST'])
    expect(calls[1][0]).toBe('https://cloud.comfy.org/api/tasks/t1')
    expect(calls.every((c) => c[2] === KEY)).toBe(true)
  })
  it('a rerun on an account that has it is a success', async () => {
    expect((await importLora({ key: KEY, fetchFn: async () => json(409, { error: 'exists' }), sleep })).ok).toBe(true)
  })
  it('a gated failure names the licence and the Hugging Face token', async () => {
    const seq = [json(202, { id: 't' }), json(200, { status: 'failed', error: 'HTTP 401 from huggingface.co' })]
    const res = await importLora({ key: KEY, fetchFn: async () => seq.shift(), sleep })
    expect(res).toEqual({ ok: false, message: GATED_HELP })
    expect(GATED_HELP).toMatch(/licence/)
    expect(GATED_HELP).toMatch(/Hugging Face read token/)
  })
  it('a refused key at submit says so, and the key never appears', async () => {
    const res = await importLora({ key: KEY, fetchFn: async () => json(401, { message: `bad ${KEY}` }), sleep })
    expect(res.ok).toBe(false)
    expect(res.message).toContain('refused your key')
    expect(res.message).not.toContain(KEY)
  })
  it('gives up with a plain reason when the task never finishes', async () => {
    let t = 0
    const fetchFn = async (url, init) => (init?.method === 'POST' ? json(202, { id: 't' }) : json(200, { status: 'running' }))
    const realNow = Date.now
    Date.now = () => (t += 400_000)
    try {
      const res = await importLora({ key: KEY, fetchFn, sleep, maxMs: 900_000 })
      expect(res.ok).toBe(false)
      expect(res.message).toContain('still running')
    } finally { Date.now = realNow }
  })
  it('a network failure is a sentence, not a throw', async () => {
    const res = await importLora({ key: KEY, fetchFn: async () => { throw new Error('ECONNRESET') }, sleep })
    expect(res.message).toContain('Could not reach')
  })
})
