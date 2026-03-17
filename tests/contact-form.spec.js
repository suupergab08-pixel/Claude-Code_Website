import { test, expect } from '@playwright/test';

test.describe('Contact Form', () => {
  test.beforeEach(async ({ page }) => {
    // Mock backend: POST /api/contact → success
    await page.route('http://localhost:5001/api/contact', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', message: 'Message received!' }),
      });
    });

    // Mock Google Sheets webhook (in case frontend calls it directly)
    await page.route('https://script.google.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: 'success' }),
      });
    });

    // Mock any Supabase calls from frontend
    await page.route('https://*.supabase.co/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], error: null }),
      });
    });

    await page.goto('/');
  });

  test('opens contact modal when Get Started is clicked', async ({ page }) => {
    await page.locator('a.btn-gold', { hasText: 'Get Started' }).first().click();
    const modal = page.locator('#contact-modal');
    await expect(modal).toBeVisible();
  });

  test('fills and submits contact form, redirects to thank-you page', async ({ page }) => {
    // Open modal via JS to avoid selector ambiguity
    await page.evaluate(() => openContactModal({ preventDefault: () => {} }));
    await expect(page.locator('#contact-modal')).toBeVisible();

    // Fill form fields
    await page.fill('#contact-name', 'Test User');
    await page.fill('#contact-email', 'testuser@example.com');
    await page.fill('#contact-message', 'This is an automated E2E test message.');

    // Submit form
    await page.click('#contact-form button[type="submit"]');

    // Expect redirect to thank-you page
    await expect(page).toHaveURL(/thank-you/, { timeout: 10000 });
    await expect(page.locator('body')).toContainText('Thank You');
  });

  test('shows validation when required fields are empty', async ({ page }) => {
    await page.evaluate(() => openContactModal({ preventDefault: () => {} }));
    await expect(page.locator('#contact-modal')).toBeVisible();

    // Try submitting empty form
    await page.click('#contact-form button[type="submit"]');

    // Form should not navigate away — HTML5 validation prevents submit
    await expect(page).toHaveURL('http://localhost:3000/');
  });
});
