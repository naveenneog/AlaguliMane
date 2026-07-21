import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const OUT = fileURLToPath(new URL('./_qa/', import.meta.url));
const BASE = process.env.BASE || 'http://localhost:5181';
const errors = [];
const watch = (p, tag) => { p.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] ${m.text()}`); }); p.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`)); };

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  watch(page, 'desktop');
  await page.addInitScript(() => {
    localStorage.setItem('tbg.am.demo.v1', '1');
    localStorage.setItem('am.tut.v1', '1');
  });
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}landing.png`, fullPage: true });
  await page.goto(`${BASE}/setup.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.card.sel', { timeout: 5000 });
  await page.screenshot({ path: `${OUT}lobby.png` });
  const aiPage = await browser.newPage({ viewport: { width: 960, height: 720 } });
  watch(aiPage, 'live-ai');
  await aiPage.addInitScript(() => {
    localStorage.setItem('tbg.am.demo.v1', '1');
    localStorage.setItem('am.tut.v1', '1');
  });
  await aiPage.goto(`${BASE}/play.html?world=malnad&mode=ai`, { waitUntil: 'networkidle' });
  await aiPage.waitForFunction(() => window.__am && window.__am.state, null, { timeout: 25000 });
  const aiSmoke = await aiPage.evaluate(async () => {
    window.__am.setFast(true);
    const before = window.__am.log.actions.length;
    await window.__am.play(0);
    const until = performance.now() + 12000;
    while (performance.now() < until) {
      const actions = window.__am.log.actions;
      if (!window.__am.busy && actions.length >= before + 2) {
        return {
          moved: actions[before + 1]?.side === 1,
          returned: window.__am.state.turn === 0 || window.__am.state.winner !== null,
          actions: actions.length - before,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return { moved: false, returned: false, actions: window.__am.log.actions.length - before };
  });
  if (!aiSmoke.moved || !aiSmoke.returned) throw new Error(`live AI did not move: ${JSON.stringify(aiSmoke)}`);
  console.log('live AI smoke:', JSON.stringify(aiSmoke));
  await aiPage.close();
  await page.goto(`${BASE}/play.html?world=malnad&mode=hotseat`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__am && window.__am.state, null, { timeout: 25000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}board-initial.png` });
  const result = await page.evaluate(async () => window.__am.autoplay(160));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}board-end.png` });
  await page.close();

  const p2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  watch(p2, 'world2');
  await p2.addInitScript(() => {
    localStorage.setItem('tbg.am.demo.v1', '1');
    localStorage.setItem('am.tut.v1', '1');
  });
  await p2.goto(`${BASE}/play.html?world=ulita&mode=hotseat`, { waitUntil: 'networkidle' });
  await p2.waitForFunction(() => window.__am && window.__am.state, null, { timeout: 25000 });
  await p2.evaluate(async () => window.__am.autoplay(24));
  await p2.waitForTimeout(400);
  await p2.screenshot({ path: `${OUT}board-mid.png` });
  await p2.close();

  const phone = await browser.newPage({ viewport: { width: 844, height: 390 } });
  watch(phone, 'phone');
  await phone.addInitScript(() => {
    localStorage.setItem('tbg.am.demo.v1', '1');
    localStorage.setItem('am.tut.v1', '1');
  });
  await phone.goto(`${BASE}/play.html?world=suggi&mode=hotseat`, { waitUntil: 'networkidle' });
  await phone.waitForFunction(() => window.__am && window.__am.state, null, { timeout: 25000 });
  await phone.waitForTimeout(1000);
  await phone.screenshot({ path: `${OUT}board-phone.png` });

  await browser.close();
  console.log('autoplay result:', JSON.stringify(result));
  console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no console/page errors');
  if (errors.length) process.exit(2);
}
main().catch((e) => { console.error(e); process.exit(1); });
