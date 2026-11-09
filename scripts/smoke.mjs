// Phase 1 checks + screenshots. Usage: node scripts/smoke.mjs <baseUrl> <outDir>
const pw = await import(process.env.PW_PATH ?? 'playwright');
const chromium = pw.chromium ?? pw.default.chromium;
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv[2] ?? 'http://localhost:4173';
const out = process.argv[3] ?? '.';
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); };

const browser = await chromium.launch();
const errors = [];

async function page(w, h, scale = 1) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return p;
}

// Landing, 1920x1080 (brand present, top-right)
let p = await page(1920, 1080, 1);
await p.goto(base + '/', { waitUntil: 'networkidle' });
const brand = await p.locator('.brand').boundingBox();
check('landing shows brand top-right', !!brand && brand.x > 1920 - 400 && brand.y < 80, JSON.stringify(brand));
check('landing brand text', (await p.locator('.brand').textContent())?.trim() === 'Innovation Shadow Board');
await p.screenshot({ path: path.join(out, 'landing-1920.png') });

// Explore map, 1280x720
p = await page(1280, 720, 1);
await p.goto(base + '/explore', { waitUntil: 'networkidle' });
await p.waitForSelector('.node', { state: 'attached' });
const nodes = await p.locator('.node').count();
const clusters = await p.locator('.cluster-label').count();
check('25 nodes', nodes === 25, `nodes=${nodes}`);
check('6 clusters', clusters === 6, `clusters=${clusters}`);
check('no horizontal page scroll', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
await p.screenshot({ path: path.join(out, 'explore-map-1280.png') });

// Zoom into node 3 and check story; Escape closes
await p.locator('.node[data-id="s03"]').click();
await p.waitForTimeout(700);
check('click opens story', await p.locator('#story.open').count() === 1);
check('story title shows', (await p.locator('.story-title').textContent())?.includes('signal 3'));
await p.screenshot({ path: path.join(out, 'story-1280.png') });
await p.keyboard.press('ArrowRight');
await p.waitForTimeout(400);
check('ArrowRight steps to next signal', (await p.locator('.story-title').textContent())?.includes('signal 4'));
await p.keyboard.press('Escape');
await p.waitForTimeout(700);
check('Escape returns to map', await p.locator('#story.open').count() === 0);
check('map visible after Escape', !(await p.locator('#map-layer').evaluate((el) => el.classList.contains('zoomed'))));

// Help overlay
await p.keyboard.press('?');
await p.waitForTimeout(200);
check('? opens help', await p.locator('#help').isVisible());
await p.screenshot({ path: path.join(out, 'help-1280.png') });
await p.keyboard.press('Escape');

// Full-screen 1920 story
const big = await page(1920, 1080, 1);
await big.goto(base + '/explore#s=s01', { waitUntil: 'networkidle' });
await big.waitForTimeout(900);
check('deep link #s=s01 opens story', await big.locator('#story.open').count() === 1);
await big.screenshot({ path: path.join(out, 'story-1920.png') });

// Phone width
const phone = await page(390, 844, 2);
await phone.goto(base + '/', { waitUntil: 'networkidle' });
check('phone landing no horizontal scroll', await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
await phone.screenshot({ path: path.join(out, 'landing-phone.png') });

// Stage route
const stage = await page(1920, 1080, 1);
await stage.goto(base + '/stage', { waitUntil: 'networkidle' });
await stage.waitForSelector('.node', { state: 'attached' });
check('stage renders map', (await stage.locator('.node').count()) === 25);
await stage.screenshot({ path: path.join(out, 'stage-1920.png') });

check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
