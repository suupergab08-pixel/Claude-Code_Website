import puppeteer from 'puppeteer';
import { readdirSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const screenshotDir = join(__dirname, 'temporary screenshots');

mkdirSync(screenshotDir, { recursive: true });

const url = process.argv[2] || 'http://localhost:3000';
const label = process.argv[3] || '';

const existing = readdirSync(screenshotDir).filter(f => f.startsWith('screenshot-'));
let maxNum = 0;
for (const f of existing) {
  const match = f.match(/^screenshot-(\d+)/);
  if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
}
const num = maxNum + 1;
const filename = label ? `screenshot-${num}-${label}.png` : `screenshot-${num}.png`;
const filepath = join(screenshotDir, filename);

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1470, height: 900 });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));

// Optional scroll offset (4th arg, in pixels)
const scrollOffset = parseInt(process.argv[4]) || 0;
if (scrollOffset > 0) {
  await page.evaluate((px) => {
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: px }));
  }, scrollOffset);
  await new Promise(r => setTimeout(r, 1500));
}

await page.screenshot({ path: filepath, fullPage: false });
await browser.close();

console.log('Screenshot saved: ' + filepath);
