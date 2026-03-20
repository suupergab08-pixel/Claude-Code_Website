import puppeteer from 'puppeteer';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const BASE = 'http://localhost:3000';
const OUT_DIR = join(import.meta.dirname, '..', 'portfolio-screenshots');

const pages = [
  { name: 'index', url: '/', label: 'Landing Page' },
  { name: 'sights', url: '/sights.html', label: 'Sights' },
  { name: 'moodboard', url: '/moodboard.html', label: 'Moodboard' },
  { name: 'dashboard', url: '/dashboard.html', label: 'Dashboard' },
  { name: 'about', url: '/about.html', label: 'About' },
  { name: 'thank-you', url: '/thank-you.html', label: 'Thank You' },
  { name: 'TesterTech', url: '/TesterTech.html', label: 'TesterTech' },
  { name: 'product', url: '/product.html', label: 'Product' },
  { name: 'creative', url: '/creative.html', label: 'Creative' },
  { name: 'community', url: '/community.html', label: 'Community' },
  { name: 'support', url: '/support.html', label: 'Support' },
  { name: 'blog', url: '/blog.html', label: 'Blog' },
  { name: 'careers', url: '/careers.html', label: 'Careers' },
  { name: 'changelog', url: '/changelog.html', label: 'Changelog' },
  { name: 'roadmap', url: '/roadmap.html', label: 'Roadmap' },
  { name: 'privacy', url: '/privacy.html', label: 'Privacy' },
  { name: 'terms', url: '/terms.html', label: 'Terms' },
  { name: 'security', url: '/security.html', label: 'Security' },
  { name: 'cookies', url: '/cookies.html', label: 'Cookies' },
];

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({ headless: true });
const results = [];

for (const pg of pages) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    const resp = await page.goto(`${BASE}${pg.url}`, { waitUntil: 'networkidle2', timeout: 15000 });
    if (!resp || resp.status() >= 400) {
      console.log(`  SKIP ${pg.name} — HTTP ${resp?.status()}`);
      await page.close();
      continue;
    }

    // Wait for any animations/transitions
    await new Promise(r => setTimeout(r, 1500));

    // Check if page has meaningful content (more than just nav/footer)
    const bodyText = await page.evaluate(() => {
      const body = document.body.innerText.trim();
      return body;
    });

    // Skip pages with very little content (< 50 chars excluding whitespace)
    const cleanText = bodyText.replace(/\s+/g, ' ').trim();
    if (cleanText.length < 50) {
      console.log(`  SKIP ${pg.name} — too little content (${cleanText.length} chars)`);
      await page.close();
      continue;
    }

    const filePath = join(OUT_DIR, `${pg.name}.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    results.push({ name: pg.name, label: pg.label, file: `${pg.name}.png` });
    console.log(`  ✓ ${pg.name} — captured`);
  } catch (err) {
    console.log(`  SKIP ${pg.name} — ${err.message}`);
  }

  await page.close();
}

await browser.close();

// Save manifest
writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(results, null, 2));
console.log(`\nDone: ${results.length} pages captured`);
