// The checks `npm run preflight` runs. Each takes a context with everything injected (env, fs, run, fetch, version,
// platform) so it can be tested without touching the machine, and returns { name, status: 'ok'|'fail'|'warn'|'info', msg, fix? }.
import path from 'node:path'
import { CREDITS_PER_USD, parseBudget } from './env.mjs'
import { fetchBalance } from './cloud.mjs'

const r = (name, status, msg, fix) => ({ name, status, msg, ...(fix ? { fix } : {}) })
const needsNode = [22, 12]
const FIRST_TAKE = 150 // credits for one scene taken through to one rendered take

export function checkNode(ctx) {
  const [maj, min] = String(ctx.version).replace(/^v/, '').split('.').map(Number)
  const ok = maj > needsNode[0] || (maj === needsNode[0] && min >= needsNode[1])
  return ok ? r('Node', 'ok', `Node ${ctx.version}`)
    : r('Node', 'fail', `Node ${ctx.version} is too old`, 'Install Node 22.12 or newer (nodejs.org), then run npm ci again in app/.')
}

export function checkTool(ctx, tool) {
  const res = ctx.run(tool, ['-version'])
  return res.ok ? r(tool, 'ok', `${tool} found`)
    : r(tool, 'fail', `${tool} not found on PATH`, 'Install ffmpeg (it ships ffprobe) and make sure both are on PATH: ffmpeg.org/download.html.')
}

export function checkEnvFile(ctx) {
  return ctx.fileFound ? r('app/.env', 'ok', 'app/.env present')
    : r('app/.env', 'fail', 'app/.env is missing', 'Copy app/.env.example to app/.env (Windows: copy app\\.env.example app\\.env), then set COMFY_API_KEY and CANVAS_DAY_BUDGET.')
}

export function checkKeySet(ctx) {
  const key = (ctx.env.COMFY_API_KEY ?? '').trim()
  if (!key) return r('COMFY_API_KEY', 'fail', 'COMFY_API_KEY is empty', 'Create an API key at cloud.comfy.org and put it in app/.env as COMFY_API_KEY=...')
  if (!/^comfyui-/.test(key)) return r('COMFY_API_KEY', 'warn', 'COMFY_API_KEY is set but does not start with "comfyui-"', 'Check you pasted the whole key; the next check says whether Cloud accepts it.')
  return r('COMFY_API_KEY', 'ok', 'COMFY_API_KEY is set')
}

/** Free balance call: proves the key and that the plan has API access. */
export async function checkKeyWorks(ctx) {
  const key = (ctx.env.COMFY_API_KEY ?? '').trim()
  const name = 'Comfy Cloud key'
  if (!key) return r(name, 'fail', 'skipped: no key', 'Set COMFY_API_KEY first.')
  if (ctx.env.COMFY_BASE_URL) return r(name, 'info', 'COMFY_BASE_URL is set (self-hosted); the Cloud key test is skipped', 'Self-hosted mode is untested; clear COMFY_BASE_URL to use Cloud.')
  const b = await fetchBalance(key, ctx.fetch)
  if (b.error) return r(name, 'fail', `could not reach Comfy Cloud (${b.error})`, 'Check your network or proxy, then run preflight again.')
  if (b.status === 401 || b.status === 403) return r(name, 'fail', `Cloud refused the key (HTTP ${b.status})`, 'Check COMFY_API_KEY in app/.env, and that your plan has API access.')
  if (b.status !== 200) return r(name, 'fail', `Cloud answered HTTP ${b.status} to the balance call`, 'Try again in a minute.')
  const credits = b.cents === null ? null : Math.round(b.cents * 2.11)
  return r(name, 'ok', credits === null ? 'key accepted by Cloud' : `key accepted by Cloud, balance about ${credits.toLocaleString('en-US')} credits`)
}

export function checkBudget(ctx) {
  const n = parseBudget(ctx.env.CANVAS_DAY_BUDGET)
  if (n === null) return r('Day budget', 'fail', 'CANVAS_DAY_BUDGET is unset or not a positive number, so every paid press is refused',
    `Set CANVAS_DAY_BUDGET=300 in app/.env (one scene taken to one rendered take is about ${FIRST_TAKE} credits), then restart the dev server.`)
  const usd = (n / CREDITS_PER_USD).toFixed(2)
  const low = n < FIRST_TAKE
  return r('Day budget', low ? 'warn' : 'ok', `${n} credits per day (about US$${usd})${low ? `, below the about ${FIRST_TAKE} a first rendered take needs` : ''}`,
    low ? 'Raise CANVAS_DAY_BUDGET to 300 to leave room for a retry.' : undefined)
}

const WIN_STUB = /[\\/]WindowsApps[\\/]/i

/** Which python the app will use, and whether it can run the finish. Reuses app/scripts/check_python.py. */
export function checkPython(ctx) {
  const name = 'Python'
  const chosen = (ctx.env.CANVAS_PYTHON || ctx.env.LIFT_PYTHON || '').trim() || 'python'
  const isPath = /[\\/]/.test(chosen)
  if (isPath && !ctx.fs.existsSync(chosen)) return r(name, 'fail', `CANVAS_PYTHON points at ${chosen}, which does not exist`, 'Set CANVAS_PYTHON to the full path of your venv python, or empty it to use PATH.')
  if (!isPath && ctx.platform === 'win32') {
    const where = ctx.run('where', [chosen])
    const first = where.ok ? where.out.split(/\r?\n/).find(Boolean) ?? '' : ''
    if (WIN_STUB.test(first)) return r(name, 'fail', `"${chosen}" on PATH is the Microsoft Store stub (${first})`, 'Create a venv and set CANVAS_PYTHON=C:\\full\\path\\to\\venv\\Scripts\\python.exe in app/.env (SETUP step 1).')
  }
  const script = path.join(ctx.root, 'app', 'scripts', 'check_python.py')
  const res = ctx.run(chosen, ['-I', script, '--json'])
  let have
  try { have = JSON.parse(res.out) } catch { have = null }
  if (!have) return r(name, 'fail', `could not run ${chosen}`, 'Install Python 3, create a venv, and set CANVAS_PYTHON to its python (SETUP step 1).')
  const miss = ['cv2', 'numpy'].filter((m) => !have[m])
  const pip = 'pip install -r app/scripts/requirements.txt (into that same venv)'
  if (miss.length) return r(name, 'fail', `${chosen} lacks ${miss.join(' + ')} (needed for the Render finish)`, pip)
  const opt = ['trimesh', 'scipy', 'skimage'].filter((m) => !have[m])
  if (opt.length) return r(name, 'warn', `${chosen} runs the Render finish; missing ${opt.join(' + ')} (only built set pieces need them)`, pip)
  return r(name, 'ok', `${chosen} has everything`)
}

/** The sample scene registered in the location manifest. */
export function checkSample(ctx) {
  const name = 'Sample scene'
  const fix = 'Run: node scripts/install-sample.mjs'
  try {
    const shot = JSON.parse(ctx.fs.readFileSync(path.join(ctx.root, 'sample', 'night-circuit', 'manifest-shot.json'), 'utf8'))
    const manifestFile = path.join(ctx.root, 'app', 'public', 'lab-assets', 'locations', 'manifest.json')
    if (!ctx.fs.existsSync(manifestFile)) return r(name, 'fail', 'sample not installed', fix)
    const m = JSON.parse(ctx.fs.readFileSync(manifestFile, 'utf8'))
    return (m.shots ?? []).some((s) => s.id === shot.id) ? r(name, 'ok', 'sample scene installed') : r(name, 'fail', 'sample not installed', fix)
  } catch {
    return r(name, 'fail', 'sample not installed (or the manifest cannot be read)', fix)
  }
}

export function checkLora(ctx) {
  const set = (ctx.env.CANVAS_L2R_LORA ?? '').trim()
  return r('Layout-To-Render LoRA', 'info', `cannot be verified from here (Cloud lists no per-account imports)${set ? `; the app will ask for "${set}"` : ''}`,
    'Once per account: node scripts/import-lora.mjs (SETUP step 5). Skip if already done; Render says if it is missing.')
}

export async function runAll(ctx) {
  return [checkNode(ctx), checkTool(ctx, 'ffmpeg'), checkTool(ctx, 'ffprobe'), checkEnvFile(ctx), checkKeySet(ctx),
    await checkKeyWorks(ctx), checkBudget(ctx), checkPython(ctx), checkSample(ctx), checkLora(ctx)]
}

const TAG = { ok: 'PASS', fail: 'FAIL', warn: 'WARN', info: 'NOTE' }
export function format(results) {
  const lines = []
  for (const x of results) {
    lines.push(`${TAG[x.status]}  ${x.name}: ${x.msg}`)
    if (x.fix && x.status !== 'ok') lines.push(`      -> ${x.fix}`)
  }
  const fails = results.filter((x) => x.status === 'fail').length
  lines.push('', fails ? `${fails} check${fails === 1 ? '' : 's'} failed. Fix the lines above and run: npm run preflight` : 'All required checks passed. No credits were spent.')
  return { text: lines.join('\n'), code: fails ? 1 : 0 }
}
