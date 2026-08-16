/**
 * Headless smoke: open JARVIS UI and fail if BrainGraph runtime faults appear.
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const BASE = process.env.JARVIS_UI_URL || 'http://127.0.0.1:5055/'
const TIMEOUT_MS = Number(process.env.VERIFY_TIMEOUT_MS || 90000)

function findChrome() {
  if (process.env.PLAYWRIGHT_CHROME && fs.existsSync(process.env.PLAYWRIGHT_CHROME)) {
    return process.env.PLAYWRIGHT_CHROME
  }
  const roots = [
    path.join(process.env.LOCALAPPDATA || '', 'ms-playwright'),
    path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright'),
  ]
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    const matches = fs
      .readdirSync(root)
      .filter((name) => name.startsWith('chromium-'))
      .sort()
      .reverse()
    for (const name of matches) {
      const candidate = path.join(root, name, 'chrome-win64', 'chrome.exe')
      if (fs.existsSync(candidate)) return candidate
    }
  }
  return undefined
}

const bad = []
const pageErrors = []
const executablePath = findChrome()

const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
})
const page = await browser.newPage()

page.on('pageerror', (err) => {
  pageErrors.push(String(err))
  bad.push(`pageerror: ${err}`)
})
page.on('console', (msg) => {
  const text = msg.text()
  if (msg.type() === 'error') bad.push(`console.error: ${text}`)
  if (/Line_ is not part of the THREE namespace/i.test(text)) bad.push(`r3f: ${text}`)
  if (/BRAIN GRAPH FAULT/i.test(text)) bad.push(`fault: ${text}`)
  if (/ChunkLoadError/i.test(text)) bad.push(`chunk: ${text}`)
})

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS })
  await page.waitForTimeout(8000)
  const body = await page.locator('body').innerText()
  if (/BRAIN GRAPH FAULT/i.test(body)) bad.push('visible: BRAIN GRAPH FAULT')
  if (/Line_ is not part of the THREE namespace/i.test(body)) bad.push('visible: Line_ namespace error')
  if (/Unhandled Runtime Error/i.test(body)) bad.push('visible: Unhandled Runtime Error')

  const canvasCount = await page.locator('canvas').count()
  if (canvasCount < 1) bad.push('no WebGL canvas mounted')

  const heroHud = await page.getByText(/HERO · CORVEX/i).count()
  if (heroHud < 1) bad.push('BrainGraph HUD missing (HERO · CORVEX)')

  console.log(
    JSON.stringify(
      {
        ok: bad.length === 0,
        canvasCount,
        heroHud,
        pageErrors,
        bad,
        url: BASE,
        executablePath: executablePath || 'playwright-default',
      },
      null,
      2,
    ),
  )
  await browser.close()
  process.exit(bad.length === 0 ? 0 : 1)
} catch (err) {
  console.error(JSON.stringify({ ok: false, fatal: String(err), bad, pageErrors }, null, 2))
  await browser.close()
  process.exit(1)
}
