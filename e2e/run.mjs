/**
 * End-to-end browser journeys for Vistara Stays.
 *
 * Runs against the dev servers (frontend :5173 proxying to the API) using your installed Chrome.
 * It uses the seeded sample accounts and creates a few "E2E …" records; remove them afterwards with
 *   (cd backend && python -m scripts.cleanup_e2e)
 *
 *   cd e2e && npm install && npm test
 * Environment (optional): BASE_URL, CHROME_PATH, SEED_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD
 */
import puppeteer from 'puppeteer-core'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'Vistara#Demo2026'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
const results = []
const pageErrors = []

const day = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

async function newPage(width = 1280) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  await page.setViewport({ width, height: 900 })
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()))
  return page
}

const waitText = (page, text, timeout = 15000) => page.waitForFunction((t) => document.body.textContent.includes(t), { timeout }, text)
async function click(page, selector, text) {
  const handle = await page.waitForFunction(
    (s, t) => [...document.querySelectorAll(s)].find((e) => e.textContent.trim().startsWith(t) && !e.disabled),
    { timeout: 15000 },
    selector,
    text,
  )
  await handle.asElement().click()
}
async function field(page, label) {
  const handle = await page.waitForFunction(
    (l) => {
      const el = [...document.querySelectorAll('label')].find((x) => x.textContent.trim() === l)
      return el && document.getElementById(el.htmlFor)
    },
    { timeout: 15000 },
    label,
  )
  return handle.asElement()
}
async function type(page, label, value) {
  const el = await field(page, label)
  await el.click({ clickCount: 3 })
  await el.type(String(value))
}
async function saveSection(page, button, method = 'PATCH') {
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === method && r.url().includes('/api/v1/owner/'), { timeout: 15000 }),
    click(page, 'button', button),
  ])
  if (response.status() >= 400) throw new Error(`${button} → HTTP ${response.status()}: ${await response.text()}`)
}
async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' })
  await page.type('input[type=email]', email)
  await page.type('input[type=password]', password)
  await page.click('button[type=submit]')
  await page.waitForSelector('button[aria-label^="Account menu"]', { timeout: 15000 })
}

async function journey(name, fn) {
  const started = Date.now()
  try {
    await fn()
    results.push({ name, ok: true, ms: Date.now() - started })
    console.log(`✓ ${name}`)
  } catch (error) {
    results.push({ name, ok: false, error: error.message.split('\n')[0] })
    console.log(`✗ ${name}\n    ${error.message.split('\n')[0]}`)
  }
}

// ---------------------------------------------------------------------------

await journey('Visitor browses, searches and filters without an account', async () => {
  const page = await newPage()
  await page.goto(BASE, { waitUntil: 'networkidle0' })
  await waitText(page, 'Find your quiet corner')
  await page.goto(`${BASE}/search?destination=coorg&check_in=${day(40)}&check_out=${day(42)}`, { waitUntil: 'networkidle0' })
  await waitText(page, 'Stays in Coorg')
  await waitText(page, 'Incl. taxes & fees')
  await page.goto(`${BASE}/search?amenity=pool`, { waitUntil: 'networkidle0' })
  await waitText(page, 'Swimming pool')
  await page.goto(`${BASE}/search?q=zzzz-no-match`, { waitUntil: 'networkidle0' })
  await waitText(page, 'No stays match your search')
})

await journey('Visitor books without logging in: four details create the account, then pays', async () => {
  const page = await newPage()
  await page.goto(`${BASE}/resorts/teafold-hill-cottages-munnar?check_in=${day(50)}&check_out=${day(52)}&rooms=1&adults=2&children=0`, { waitUntil: 'networkidle0' })
  await click(page, 'aside button', 'Reserve')
  await page.waitForFunction(() => location.pathname === '/checkout', { timeout: 15000 })
  await waitText(page, 'Total (INR)')
  await type(page, 'First name', 'E2E')
  await type(page, 'Last name', 'Guest')
  await type(page, 'Email', `e2e+${Date.now()}@example.com`)
  await type(page, 'Mobile number', '+919812345678')
  await page.click('input[type=checkbox]')
  await click(page, 'button[type=submit]', 'Continue to payment')
  await waitText(page, 'Room held for')
  await click(page, 'button', 'Simulate successful payment')
  await page.waitForFunction(() => location.pathname.startsWith('/trips/'), { timeout: 15000 })
  await waitText(page, 'Simulated payment — no money was charged')
  await page.waitForSelector('button[aria-label^="Account menu"]', { timeout: 15000 })
  // Cancel so the room is released; cleanup_e2e removes the e2e+… account afterwards.
  await click(page, 'button', 'Cancel this booking')
  await click(page, 'button', 'Yes, cancel')
  await waitText(page, 'Refund:')
})

await journey('Customer books, pays (simulated) and cancels with the saved policy', async () => {
  const page = await newPage()
  await login(page, 'demo.customer@example.com', SEED_PASSWORD)
  await page.goto(`${BASE}/resorts/misty-fern-estate-coorg?check_in=${day(60)}&check_out=${day(62)}&rooms=1&adults=2&children=0`, { waitUntil: 'networkidle0' })
  await click(page, 'aside button', 'Reserve')
  await waitText(page, 'Total (INR)')
  await type(page, 'Mobile number', '+919876543210')
  await page.click('input[type=checkbox]')
  await click(page, 'button[type=submit]', 'Continue to payment')
  await waitText(page, 'Room held for')
  await click(page, 'button', 'Simulate successful payment')
  await page.waitForFunction(() => location.pathname.startsWith('/trips/'), { timeout: 15000 })
  await waitText(page, 'Simulated payment — no money was charged')
  await waitText(page, 'Property address')
  await click(page, 'button', 'Cancel this booking')
  await click(page, 'button', 'Yes, cancel')
  await waitText(page, 'Refund:')
})

await journey('Customer saves a favourite and the session survives a reload', async () => {
  const page = await newPage()
  await login(page, 'demo.customer@example.com', SEED_PASSWORD)
  const save = await page.waitForSelector('button[aria-label^="Save Misty Fern"], button[aria-label^="Remove Misty Fern"]')
  if ((await save.evaluate((e) => e.getAttribute('aria-label'))).startsWith('Save')) await save.click()
  await page.waitForSelector('button[aria-label^="Remove Misty Fern"]')
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('button[aria-label^="Account menu"]', { timeout: 15000 })
  await page.goto(`${BASE}/favourites`, { waitUntil: 'networkidle0' })
  await waitText(page, 'Misty Fern Estate Stay')
  await page.click('button[aria-label^="Remove Misty Fern"]')
})

let e2eListing = null
await journey('Owner lists a property and submits it for review', async () => {
  const page = await newPage()
  await login(page, 'owner.westernghats@example.com', SEED_PASSWORD)
  await page.waitForFunction(() => location.pathname === '/owner', { timeout: 15000 })
  await page.goto(`${BASE}/owner/resorts?new=1`, { waitUntil: 'networkidle0' })
  e2eListing = `E2E Hill Cottages ${Date.now() % 100000}`
  await type(page, 'Property name', e2eListing)
  await (await field(page, 'Destination')).select('coorg')
  await (await field(page, 'Type')).select('cottage')
  await click(page, 'button', 'Create draft')
  await page.waitForFunction(() => /^\/owner\/resorts\/[0-9a-f]{24}$/.test(location.pathname), { timeout: 15000 })
  await type(page, 'Description', 'A fictional end-to-end test listing: quiet cottages above coffee estates, with long walks and misty mornings.')
  await saveSection(page, 'Save details')
  await type(page, 'Street address', '7 Estate Road')
  await type(page, 'Latitude', '12.43')
  await type(page, 'Longitude', '75.74')
  await saveSection(page, 'Save location')
  const wifi = await page.waitForFunction(() => [...document.querySelectorAll('#amenities label')].find((l) => l.textContent.includes('Wi-Fi'))?.querySelector('input'))
  await wifi.asElement().click()
  await saveSection(page, 'Save amenities')
  for (let i = 0; i < 3; i++) {
    await type(page, 'Photo description', `Test photo ${i + 1}`)
    await (await page.$('#photos input[type=file]')).uploadFile(path.join(FIXTURES, `photo${i}.png`))
    await page.waitForFunction((n) => document.querySelectorAll('#photos li').length === n, { timeout: 15000 }, i + 1)
  }
  await saveSection(page, 'Save photos')
  await click(page, 'button', 'Add room type')
  await type(page, 'Room name', 'Estate View Cottage')
  await type(page, 'Weekday rate', '5500')
  await saveSection(page, 'Add room', 'POST')
  await click(page, 'button', 'Submit for review')
  await waitText(page, 'Pending review')
})

await journey('Admin approves the listing and it becomes public', async () => {
  if (!ADMIN_PASSWORD) throw new Error('Set ADMIN_PASSWORD to run this journey')
  if (!e2eListing) throw new Error('Owner journey did not create a listing')
  const page = await newPage()
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD)
  await page.goto(`${BASE}/admin/resorts`, { waitUntil: 'networkidle0' })
  await click(page, 'a', e2eListing.slice(0, 10))
  await page.waitForFunction((n) => document.body.textContent.includes(n), {}, e2eListing)
  await click(page, 'button', 'Approve and publish')
  await waitText(page, 'Published')
  const slug = await page.evaluate(() => document.querySelector('a[href^="/resorts/"]')?.getAttribute('href'))
  const visitor = await newPage()
  await visitor.goto(`${BASE}/search?q=${encodeURIComponent(e2eListing)}`, { waitUntil: 'networkidle0' })
  await waitText(visitor, e2eListing)
  void slug
})

await journey('Admin pages render and the audit log records decisions', async () => {
  if (!ADMIN_PASSWORD) throw new Error('Set ADMIN_PASSWORD to run this journey')
  const page = await newPage()
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD)
  for (const [route, marker] of [['/admin', 'Listings awaiting review'], ['/admin/users', 'Search'], ['/admin/bookings', 'Reference'], ['/admin/reviews', 'Open reports'], ['/admin/destinations', 'Coorg'], ['/admin/coupons', 'Create coupon'], ['/admin/settings', 'GST slabs'], ['/admin/audit', 'resort.approve']]) {
    await page.goto(BASE + route, { waitUntil: 'networkidle0' })
    await waitText(page, marker)
  }
})

await journey('Each account type is blocked from the others’ areas', async () => {
  const customer = await newPage()
  await login(customer, 'demo.customer@example.com', SEED_PASSWORD)
  for (const route of ['/owner', '/admin']) {
    await customer.goto(BASE + route, { waitUntil: 'networkidle0' })
    await waitText(customer, 'You don’t have access to this page')
  }
  const visitor = await newPage()
  await visitor.goto(`${BASE}/trips`, { waitUntil: 'networkidle0' })
  await visitor.waitForFunction(() => location.pathname === '/login', { timeout: 15000 })
})

await journey('Pages fit a 375px phone screen without horizontal scrolling', async () => {
  const page = await newPage(375)
  for (const route of ['/', '/search?destination=munnar', '/resorts/kayal-drift-villas-kumarakom', '/destinations', '/login']) {
    await page.goto(BASE + route, { waitUntil: 'networkidle0' })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    if (overflow) throw new Error(`Horizontal overflow on ${route}`)
  }
})

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} journeys passed`)
if (pageErrors.length) console.log(`Page errors:\n  ${[...new Set(pageErrors)].slice(0, 10).join('\n  ')}`)
process.exit(failed.length || pageErrors.length ? 1 : 0)
