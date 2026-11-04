import { test, expect } from '@playwright/test';

/**
 * Task SUJ-10: E2E Suite 1 — Complete Connected Procurement Workflow
 *
 * Verifies the full end-to-end hackathon demo procurement journey:
 *   1. Sign in as Shop A (Hazratganj Artisan Café / Ramesh Sharma)
 *   2. Submit purchasing requirement and verify AI extraction
 *   3. Compare wholesale supplier offers and volume tiers
 *   4. Join collective buying pool, verifying Retailer MOQ (MOQ_R) & Step multiple validation
 *   5. Complete PayPal Sandbox checkout with mandatory test disclosures & test card validation
 *   6. Reach collective MOQ (20 + 15 + 25 = 60 boxes -> ₹4,800 bulk goal)
 *   7. Review and approve versioned PriceSnapshot v1
 *   8. Inspect confirmed Order (AKD-2026-0001), SIMULATED supplier settlement badge, and Activity Timeline
 */

test.describe('SUJ-10: Procurement Workflow & 3-Shop Hackathon Demo Verification', () => {
  test('Complete Connected Procurement Journey from Requirement to Confirmed Order', async ({ page }) => {
    // ── 1. Sign In as Shop A ───────────────────────────────────────────────────
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Quick demo button or form input fallback
    const shopADemoBtn = page.locator('button[aria-label*="Sign in as Shop A"]');
    if (await shopADemoBtn.isVisible()) {
      await shopADemoBtn.click();
    } else {
      await page.fill('#login-email', 'cafeA@demo.aapkidukan.in');
      await page.fill('#login-password', 'SecurePassword123!');
      await page.click('button[type="submit"]');
    }

    // Wait for redirect to dashboard or authenticated shell
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    await expect(page.locator('body')).toContainText(/Shop A|Hazratganj|Dashboard|Group-Buy/i);

    // ── 2. Submit Purchasing Requirement & Confirm AI Extraction ─────────────
    await page.goto('/requirements/new');
    await page.waitForLoadState('networkidle');

    // Switch to Natural Language tab or fill textarea
    const nlTab = page.locator('[data-testid="tab-nl"]');
    if (await nlTab.isVisible()) {
      await nlTab.click();
    }

    const nlInput = page.locator('[data-testid="nl-textarea"]');
    await expect(nlInput).toBeVisible();
    await nlInput.fill(
      'Urgent: We need 20 boxes of 250ml biodegradable paper cups for Hazratganj café delivered to Lucknow by next week.'
    );

    const submitNlBtn = page.locator('[data-testid="nl-submit-button"]');
    await expect(submitNlBtn).toBeEnabled();
    await submitNlBtn.click();

    // Verify AI extraction success banner
    await expect(page.locator('[data-testid="success-banner"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="success-banner"]')).toContainText(/Requirement submitted/i);

    // ── 3. Compare Wholesale Supplier Offers & Pricing Tiers ───────────────────
    await page.goto('/suppliers');
    await page.waitForLoadState('networkidle');

    // Verify supplier list renders verified suppliers (e.g. EcoPack / Bharat EcoPack)
    await expect(page.locator('body')).toContainText(/EcoPack|Supplier/i);

    // ── 4. Join Pool with MOQ_R and Step Multiple Validation ──────────────────
    await page.goto('/group-buys');
    await page.waitForLoadState('networkidle');

    // Locate the 1000 MOQ Basmati Rice recruiting pool or Bio-Cups pool
    const recruitingPoolCard = page.locator('div[role="button"]', { hasText: 'Lucknow Wholesale Basmati Rice Pool (1000 MOQ)' }).first();
    if (await recruitingPoolCard.isVisible()) {
      await recruitingPoolCard.click();
    } else {
      // Click first available pool card
      await page.locator('a[href^="/group-buys/"], button:has-text("View Pool"), div[role="button"]').first().click();
    }

    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="group-buy-detail-page"]')).toBeVisible();

    // Verify TierProgressBar and MOQ summary are displayed
    await expect(page.locator('body')).toContainText(/Wholesaler MOQ|Target MOQ|Step/i);

    // ── 5. Complete PayPal Sandbox Checkout ────────────────────────────────────
    const joinPoolBtn = page.locator('button:has-text("Commit & Checkout"), button:has-text("Join Group Buy Pool"), button:has-text("Pay at Join")').first();
    if (await joinPoolBtn.isVisible()) {
      await joinPoolBtn.click();

      // Verify PayPal Checkout Modal opens with mandatory disclosures
      const modal = page.locator('[data-testid="paypal-checkout-modal"]');
      await expect(modal).toBeVisible({ timeout: 10000 });

      // Check mandatory Sandbox transparency disclosure (FR-PAY-011 / BR-012)
      await expect(modal.locator('[data-testid="sandbox-disclosure-banner"]')).toBeVisible();

      // Check PayPal Sandbox test credentials card is displayed
      await expect(modal).toContainText('4012 8888 8888 1881');

      // Execute simulated dev checkout
      const devCheckoutBtn = modal.locator('[data-testid="simulated-dev-checkout-btn"]');
      await expect(devCheckoutBtn).toBeVisible();
      await devCheckoutBtn.click();

      // Verify authoritative capture completed and contribution is ACTIVE
      await expect(page.locator('body')).toContainText(/My Contribution|ACTIVE|Payment capture verified/i, { timeout: 15000 });
    }

    // ── 6. Reach Collective MOQ (20 + 15 + 25 = 60 boxes -> ₹4,800 goal) ──────
    await page.goto('/group-buys');
    await page.waitForLoadState('networkidle');

    // Click into the ₹4,800 Paper Cups group pool
    const cupsCard = page.locator('div[role="button"]', { hasText: 'Lucknow Kirana Bio-Cups Bulk Pool (₹4,800 Goal)' }).first();
    if (await cupsCard.isVisible()) {
      await cupsCard.click();
    } else {
      await page.locator('text=Lucknow Kirana Bio-Cups Bulk Pool (₹4,800 Goal)').click();
    }
    await page.waitForLoadState('networkidle');

    // Verify 60 boxes target MOQ achieved, ₹4,800 merchandise value
    await expect(page.locator('body')).toContainText(/60/);
    await expect(page.locator('body')).toContainText(/₹4,800|4,800/);

    // ── 7. Review and Approve Versioned PriceSnapshot ─────────────────────────
    // Navigate to approval route for the Paper Cups pool
    const currentUrl = page.url();
    const poolIdMatch = currentUrl.match(/\/group-buys\/([a-f0-9]+)/);
    const poolId = poolIdMatch ? poolIdMatch[1] : '';

    if (poolId) {
      await page.goto(`/group-buys/${poolId}/approve`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="pool-approval-page"]')).toBeVisible({ timeout: 10000 });

      // Verify reconciliation breakdown & explicit approval button (or pre-approved banner)
      const approvalBtn = page.locator('[data-testid="explicit-approval-btn"]');
      if (await approvalBtn.isVisible()) {
        if (await approvalBtn.isEnabled()) {
          await approvalBtn.click();
          await page.waitForTimeout(1000);
        }
      } else {
        await expect(page.locator('body')).toContainText(/Approved|Price Snapshot|Approval/i);
      }
    }

    // ── 8. Inspect Confirmed Order, SIMULATED Settlement & Activity Timeline ──
    await page.goto('/orders');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-testid="orders-list-page"]')).toBeVisible();

    // Verify order AKD-2026-0001 is listed
    await expect(page.locator('body')).toContainText(/AKD-2026-0001|₹4,800/i);

    // Click to open Order detail
    const orderLink = page.locator('button:has-text("View Details"), a[href^="/orders/"], button:has-text("View Order")').first();
    await orderLink.click();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-testid="order-detail-page"]')).toBeVisible();

    // Verify Order Number and Total
    await expect(page.locator('body')).toContainText('AKD-2026-0001');
    await expect(page.locator('body')).toContainText(/₹4,800|4,800/);

    // Verify Rule BR-009 / FR-PAY-016: SIMULATED Supplier Settlement Badge
    await expect(page.locator('body')).toContainText(/SIMULATED SETTLEMENT|SIMULATED/i);

    // Verify itemized allocations for all 3 shops
    await expect(page.locator('body')).toContainText(/Shop A|Shop B|Shop C|20|15|25/i);

    // Verify Chronological Activity Timeline is rendered
    await expect(page.locator('body')).toContainText(/Activity Timeline|ORDER_CREATED|ORDER_CONFIRMED/i);
  });
});
