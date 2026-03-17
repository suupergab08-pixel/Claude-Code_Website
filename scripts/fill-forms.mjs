import { chromium } from 'playwright';

const names = [
  'Alice Johnson', 'Brian Smith', 'Carlos Rivera', 'Diana Lee', 'Ethan Brown',
  'Fiona Chen', 'George Martinez', 'Hannah Wilson', 'Ivan Petrov', 'Julia Adams',
  'Kevin Park', 'Laura Nguyen', 'Marcus Taylor', 'Nina Patel', 'Oscar Kim',
  'Priya Sharma', 'Quinn Davis', 'Rachel Evans', 'Samuel Torres', 'Tina Morales',
];

const messages = [
  'We need automated regression testing for our mobile app.',
  'Looking for QA support for our SaaS platform launch.',
  'Interested in your pricing for a startup team of 5.',
  'Can you handle both manual and automated testing?',
  'We have a legacy system that needs thorough QA coverage.',
  'Exploring QA options for our e-commerce site.',
  'Need performance and load testing for our API.',
  'Interested in your Enterprise plan for our company.',
  'We want to set up CI/CD with automated tests.',
  'Looking for QA consulting for a 3-month project.',
  'Can you support cross-browser and cross-device testing?',
  'We need bug tracking and test reporting dashboards.',
  'Interested in QA for our healthcare app (HIPAA).',
  'We are launching a fintech product and need thorough testing.',
  'Looking for a QA partner for our agile team.',
  'We need accessibility testing for our web app.',
  'Interested in your Growth plan — can we schedule a call?',
  'We have 200+ test cases to migrate to automation.',
  'Need security and penetration testing alongside QA.',
  'Exploring your services for a government contract project.',
];

const browser = await chromium.launch({ headless: true });

for (let i = 0; i < 20; i++) {
  const name = names[i];
  const email = `test.user.${i + 1}@example.com`;
  const message = messages[i];

  const page = await browser.newPage();
  try {
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.evaluate(() => openContactModal({ preventDefault: () => {} }));
    await page.waitForSelector('#contact-modal.open', { timeout: 5000 });

    await page.fill('#contact-name', name);
    await page.fill('#contact-email', email);
    await page.fill('#contact-message', message);

    await page.click('#contact-form button[type="submit"]');
    await page.waitForURL(/thank-you/, { timeout: 15000 });

    console.log(`[${i + 1}/20] ✓ ${name} <${email}>`);
  } catch (err) {
    console.error(`[${i + 1}/20] ✗ ${name} — ${err.message}`);
  } finally {
    await page.close();
  }
}

await browser.close();
console.log('\nDone. Check Supabase and Google Sheets for the 20 submissions.');
