// Browser check: opens index.html from file:// at desktop and phone sizes.
// Checks the title shows, no console errors, no sideways scroll. Usage: node tools/e2e/boot-check.js [outDir]
'use strict';
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const outDir = path.resolve(process.argv[2] || path.join(__dirname, 'out'));
const SIZES = [{ name: 'desktop', width: 1280, height: 800 }, { name: 'phone', width: 390, height: 844 }];

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const problems = [];
  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(pathToFileURL(path.join(ROOT, 'index.html')).href);
    await page.waitForSelector('.title-screen h1');
    const info = await page.evaluate(() => ({
      title: document.querySelector('.title-screen h1').textContent,
      name: window.B3 && window.B3.NAME,
      overflow: document.documentElement.scrollWidth > window.innerWidth
    }));
    await page.screenshot({ path: path.join(outDir, 'boot-' + size.name + '.png') });
    if (info.title !== info.name) problems.push(size.name + ': title shows "' + info.title + '"');
    if (info.overflow) problems.push(size.name + ': page scrolls sideways');
    for (const e of errors) problems.push(size.name + ': console error: ' + e);
    console.log(size.name + ' ' + size.width + 'x' + size.height + ': title "' + info.title + '", ' + errors.length + ' console errors');
    await page.close();
  }
  await browser.close();
  if (problems.length) {
    console.log('\nFAIL\n' + problems.join('\n'));
    process.exit(1);
  }
  console.log('boot check passed (screenshots in ' + outDir + ')');
})().catch((e) => { console.error(e); process.exit(1); });
