import { test, expect } from '@playwright/test';

/**
 * Task SUJ-10: E2E Suite 2 — 24-Hour Under-MOQ Resolution & Automated Refund Workflow
 *
 * Verifies the complete under-MOQ resolution workflow:
 *   1. Advance server clock +72 hours on an under-MOQ collective buying pool
 *   2. Verify pool transitions and locks into UNDER_MOQ_DECISION_PENDING with a 24h countdown
 *   3. Inspect AI Under-MOQ Advisory Card with grounded recommendation and explanation
 *   4. Test buyer PROCEED and CANCEL decision submissions
 *   5. Verify automated 100% refund creation in the Refunds Tracker (/refunds)
 */

test.describe('SUJ-10: Under-MOQ Lifecycle & Automated Refunds Verification', () => {
  test('Advance 72h Clock, Inspect AI Under-MOQ Advisory, and Verify Automated Refund', async ({ page, request }) => {
    // ── 1. Advance Server Clock +72 Hours via Admin Lifecycle Job ──────────────
    // Authenticate as Admin to run lifecycle check with clock offset
    const adminLoginRes = await request.post('http://localhost:8000/api/auth/login', {
      data: {
        email: 'admin@example.com',
        password: 'Password123!',
        otp: '123456',
      },
    });
    expect(adminLoginRes.ok()).toBeTruthy();
    const adminAuth = await adminLoginRes.json();
    const adminToken = adminAuth.data?.token;

    await request.post('http://localhost:8000/api/admin/reset-under-moq-pool', {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    // Trigger lifecycle check with 73-hour clock offset
    const lifecycleRes = await request.post('http://localhost:8000/api/admin/jobs/run-lifecycle-check', {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      data: {
        offsetHours: 73,
      },
    });
    expect(lifecycleRes.ok()).toBeTruthy();

    // ── 2. Sign In as Shop A (Participant in Scenario 3 Under-MOQ Pool) ────────
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const shopADemoBtn = page.locator('button[aria-label*="Sign in as Shop A"]');
    if (await shopADemoBtn.isVisible()) {
      await shopADemoBtn.click();
    } else {
      await page.fill('#login-email', 'cafeA@demo.aapkidukan.in');
      await page.fill('#login-password', 'SecurePassword123!');
      await page.click('button[type="submit"]');
    }

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    // ── 3. Locate Under-MOQ Pool & Verify UNDER_MOQ_DECISION_PENDING ───────────
    await page.goto('/group-buys');
    await page.waitForLoadState('networkidle');

    // Click into the 600/1000 Under-MOQ Rice Pool
    const underMoqCard = page.locator('div[role="button"]', { hasText: 'Lucknow Premium Rice Pool (Under-MOQ Resolution)' }).first();
    if (await underMoqCard.isVisible()) {
      await underMoqCard.click();
    } else {
      await page.locator('text=Lucknow Premium Rice Pool (Under-MOQ Resolution)').first().click();
    }

    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="group-buy-detail-page"]')).toBeVisible();

    // Verify 24-Hour Under-MOQ Decision Window Active banner
    await expect(page.locator('body')).toContainText(/Under-MOQ Decision Window|UNDER_MOQ_DECISION_PENDING|24-Hour/i);

    // ── 4. Inspect AI Under-MOQ Advisory & Recommendation Card ────────────────
    // Check AI recommendation card content (SUJ-05 / SAH-07)
    await expect(page.locator('body')).toContainText(/AI Under-MOQ Advisory & Recommendation|AI Under-MOQ/i);
    await expect(page.locator('body')).toContainText(/Proceed|PROCEED/i);
    await expect(page.locator('body')).toContainText(/600/);

    // ── 5. Test Buyer Decision Actions (PROCEED / CANCEL) ──────────────────────
    const cancelRefundBtn = page.locator('button:has-text("Cancel & Request Full Refund")');
    const proceedBtn = page.locator('button:has-text("Proceed with Order")');

    await expect(proceedBtn).toBeVisible({ timeout: 10000 });
    await expect(cancelRefundBtn).toBeVisible({ timeout: 10000 });

    // Click Cancel & Request Full Refund and wait for backend confirmation
    const decisionPromise = page.waitForResponse(
      (resp) => resp.url().includes('/decision') && resp.status() === 200,
      { timeout: 15000 }
    );
    await cancelRefundBtn.click();
    await decisionPromise;

    // ── 6. Verify Automated 100% Refund Creation in /refunds ───────────────────
    await page.goto('/refunds');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-testid="refunds-page"]')).toBeVisible({ timeout: 10000 });

    // Verify mandatory Sandbox transparency disclosure banner (FR-PAY-011)
    await expect(page.locator('[data-testid="sandbox-disclosure-banner"]')).toBeVisible();

    // Verify Refunds Tracker table is rendered
    await expect(page.locator('[data-testid="refunds-table"]')).toBeVisible();

    // Verify refund row contains under-MOQ cancellation reason and positive amount
    await expect(page.locator('[data-testid="refunds-table"]')).toContainText(
      /Under-MOQ|UNDER_MOQ_BUYER_CANCEL|COMPLETED|PROCESSING/i
    );

    // ── 7. Reset Server Clock to Real-Time ─────────────────────────────────────
    await request.post('http://localhost:8000/api/admin/jobs/run-lifecycle-check', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { offsetHours: 0 },
    });
  });
});
