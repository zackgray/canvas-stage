// Drive the A5 browser check in headless Chromium: start a bare Vite server (no lab plugins, no spend) on port 5177, open
// scale.html, print window.__a5. Run from app/:  node src/labs/projection/engine/__checks__/scale.check.mjs
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const PORT = 5177
const server = await createServer({ configFile: false, root: process.cwd(), server: { port: PORT, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(`http://localhost:${PORT}/src/labs/projection/engine/__checks__/scale.html`)
  await page.waitForFunction(() => window.__a5, null, { timeout: 300_000 })
  const out = await page.evaluate(() => window.__a5)
  console.log(JSON.stringify({ ...out, consoleErrors: errors }, null, 2))
} finally {
  await browser.close()
  await server.close()
}
