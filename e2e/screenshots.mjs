/**
 * Regenerates the README screenshots from the running dev servers.
 *   cd e2e && ADMIN_PASSWORD=… node screenshots.mjs
 * Output: docs/screenshots/*.jpg
 */
import puppeteer from 'puppeteer-core'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PASSWORD = process.env.SEED_PASSWORD ?? 'Vistara#Demo2026'
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'screenshots')
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true })

async function page(width = 1280, height = 820) {
  const ctx = await browser.createBrowserContext()
  const p = await ctx.newPage()
  await p.setViewport({ width, height, deviceScaleFactor: 1 })
  return p
}
async function settle(p) {
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)) }
    window.scrollTo(0, 0)
  })
  await p.evaluate(() => Promise.race([new Promise((r) => setTimeout(r, 6000)), Promise.all([...document.images].filter((i) => i.offsetParent).map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r }))))]))
  await new Promise((r) => setTimeout(r, 600))
}
async function shot(p, name, { scrollTo } = {}) {
  await settle(p)
  if (scrollTo) await p.evaluate((s) => { const el = document.querySelector(s); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 80) }, scrollTo)
  await new Promise((r) => setTimeout(r, 400))
  await p.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 82 })
  console.log('saved', name)
}
async function login(p, email, password) {
  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle0' })
  await p.type('input[type=email]', email)
  await p.type('input[type=password]', password)
  await p.click('button[type=submit]')
  await p.waitForSelector('button[aria-label^="Account menu"]', { timeout: 15000 })
}

const visitor = await page()
await visitor.goto(BASE, { waitUntil: 'networkidle0' }); await shot(visitor, '01-home')
await visitor.goto(`${BASE}/search?destination=coorg&amenity=wifi`, { waitUntil: 'networkidle0' }); await shot(visitor, '02-search')
await visitor.goto(`${BASE}/search?state=kerala&check_in=${day(45)}&check_out=${day(47)}`, { waitUntil: 'networkidle0' }); await shot(visitor, '03-search-with-dates')
await visitor.goto(`${BASE}/resorts/misty-fern-estate-coorg?check_in=${day(45)}&check_out=${day(47)}&adults=2&children=1&child_age=7&rooms=1`, { waitUntil: 'networkidle0' })
await shot(visitor, '04-resort'); await shot(visitor, '05-resort-rooms-and-price', { scrollTo: '#rooms' })
await shot(visitor, '06-resort-reviews', { scrollTo: '#reviews' })

const customer = await page()
await login(customer, 'demo.customer@example.com', PASSWORD)
await customer.goto(`${BASE}/trips?tab=past`, { waitUntil: 'networkidle0' }); await shot(customer, '07-trips')

const owner = await page()
await login(owner, 'owner.westernghats@example.com', PASSWORD)
await owner.waitForFunction(() => document.body.textContent.includes('Occupancy, next 30 days'), { timeout: 15000 }); await shot(owner, '08-owner-dashboard')
await owner.goto(`${BASE}/owner/calendar`, { waitUntil: 'networkidle0' })
await owner.waitForFunction(() => document.body.textContent.includes('left'), { timeout: 15000 }); await shot(owner, '09-owner-calendar')

if (process.env.ADMIN_PASSWORD) {
  const admin = await page()
  await login(admin, process.env.ADMIN_EMAIL ?? 'admin@example.com', process.env.ADMIN_PASSWORD)
  await admin.waitForFunction(() => document.body.textContent.includes('Listings awaiting review'), { timeout: 15000 }); await shot(admin, '10-admin-overview')
}

const phone = await page(390, 844)
await phone.goto(BASE, { waitUntil: 'networkidle0' }); await shot(phone, '11-mobile-home')
await phone.goto(`${BASE}/resorts/kayal-drift-villas-kumarakom`, { waitUntil: 'networkidle0' }); await shot(phone, '12-mobile-resort')
await browser.close()
