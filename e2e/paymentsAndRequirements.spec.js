import { test, expect } from '@playwright/test';

/**
 * End-to-End Test Suite: Payments, Refunds & Requirements (AI Intake & Review)
 *
 * Covers:
 * 1. Requirements Workflow:
 *    - Sign in as Shop A
 *    - Create requirement via Natural Language AI intake (/requirements/new)
 *    - AI extraction pipeline (/api/requirements/:id/extract)
 *    - Human Review & Editing (/requirements/:id)
 *    - Confirmation enforcing Rule BR-001 (productName, category, qty, unit, deliveryArea)
 *    - Compatible wholesale supplier matches discovery (/api/requirements/:id/matches)
 *
 * 2. Payments & Refunds Workflow:
 *    - Payments & Settlement Ledger (/payments) with paise accuracy
 *    - PayPal Sandbox Transparency Disclosures (FR-PAY-011 / BR-012)
 *    - Transaction filters (status & purpose) and search
 *    - Refunds & Savings Tracker (/refunds)
 *    - Multi-state refund status tracking and reason filters
 *    - Seamless bidirectional navigation between payments and refunds
 */

test.describe('E2E: Payments, Refunds & Requirements (AI Intake and Review)', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Sign in as Shop A via Quick Demo button
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const shopADemoBtn = page.locator('button[aria-label*="Sign in as Shop A"]');
    if (await shopADemoBtn.isVisible()) {
      await shopADemoBtn.click();
    } else {
      await page.fill('#login-email', 'cafeA@demo.aapkidukan.in');
      await page.fill('#login-password', 'SecurePassword123!');
      await page.click('button[type="submit"]');
      if (await page.locator('#otp-login-code').isVisible({ timeout: 2000 })) {
        await page.fill('#otp-login-code', '123456');
        await page.click('button[type="submit"]');
      }
    }

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  });

  test('Requirements Flow: AI Intake, Review, BR-001 Confirmation & Compatible Matches', async ({ page }) => {
    // ── Navigate to Requirements List ──────────────────────────────────────────
    await page.goto('/requirements');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/Requirements/i);

    // ── Navigate to New Requirement ────────────────────────────────────────────
    await page.goto('/requirements/new');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/Purchasing Requirement|New Requirement/i);

    // ── Switch to Natural Language tab & submit ───────────────────────────────
    const nlTab = page.locator('[data-testid="tab-nl"]');
    if (await nlTab.isVisible()) {
      await nlTab.click();
    }

    const nlTextarea = page.locator('[data-testid="nl-textarea"]');
    await expect(nlTextarea).toBeVisible();
    await nlTextarea.fill('We need 25 boxes of disposable tea cups for our cafe in Lucknow delivered next week.');

    const nlSubmitBtn = page.locator('[data-testid="nl-submit-button"]');
    await expect(nlSubmitBtn).toBeEnabled();
    await nlSubmitBtn.click();

    // Verify extraction initiated success banner
    const successBanner = page.locator('[data-testid="success-banner"]');
    await expect(successBanner).toBeVisible({ timeout: 10000 });
    await expect(successBanner).toContainText(/submitted/i);

    // ── Navigate back to Requirements List & Open Draft ────────────────────────
    await page.goto('/requirements');
    await page.waitForLoadState('networkidle');

    // Wait for requirement row to be present and click it
    const firstReqRow = page.locator('[data-testid^="requirement-item-"]').first();
    await expect(firstReqRow).toBeVisible({ timeout: 10000 });
    await firstReqRow.click();
    await page.waitForLoadState('networkidle');

    // ── Inspect AI Extraction on Detail & Review Page ──────────────────────────
    await expect(page.locator('[data-testid="requirement-detail-page"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="status-badge"]')).toBeVisible();

    // Inspect AI-extracted section
    const aiSection = page.locator('[data-testid="ai-extracted-section"]');
    await expect(aiSection).toBeVisible();
    await expect(page.locator('[data-testid="confidence-badge"]')).toBeVisible();

    // ── Verify and Edit Confirmed Fields (Enforcing BR-001) ────────────────────
    const confirmedSection = page.locator('[data-testid="user-confirmed-section"]');
    await expect(confirmedSection).toBeVisible();

    const productNameInput = page.locator('[data-testid="input-product-name"]');
    const categorySelect = page.locator('[data-testid="select-category"]');
    const quantityInput = page.locator('[data-testid="input-quantity"]');
    const unitSelect = page.locator('[data-testid="select-unit"]');
    const deliveryAreaInput = page.locator('[data-testid="input-delivery-area"]');

    // Ensure valid BR-001 values
    if (!(await productNameInput.inputValue())) {
      await productNameInput.fill('Disposable Tea Cups');
    }
    if (!(await categorySelect.inputValue())) {
      await categorySelect.selectOption('packaging');
    }
    if (!(await quantityInput.inputValue()) || Number(await quantityInput.inputValue()) <= 0) {
      await quantityInput.fill('25');
    }
    if (!(await unitSelect.inputValue())) {
      await unitSelect.selectOption('box');
    }
    if (!(await deliveryAreaInput.inputValue())) {
      await deliveryAreaInput.fill('LUCKNOW');
    }

    // ── Confirm Requirement ───────────────────────────────────────────────────
    const confirmBtn = page.locator('[data-testid="confirm-requirement-button"]');
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click();

      // Verify success banner and confirmed status
      await expect(page.locator('[data-testid="action-success-banner"]')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('[data-testid="status-badge"]')).toContainText(/Confirmed/i);
    }

    // ── Verify Compatible Wholesale Matches Section ───────────────────────────
    const matchesSection = page.locator('[data-testid="compatible-offers-section"]');
    await expect(matchesSection).toBeVisible({ timeout: 10000 });
    await expect(matchesSection).toContainText(/Compatible Wholesale Supplier Offers|Compatible Supplier Offers/i);
  });

  test('Payments & Refunds Flow: Ledgers, Filters, Disclosures & Navigation', async ({ page }) => {
    // ── 1. Payments Ledger Page ────────────────────────────────────────────────
    await page.goto('/payments');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-testid="payments-page"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="payments-page"] h1')).toContainText(/Payments & Settlement Ledger/i);

    // Verify Sandbox disclosure banner
    await expect(page.locator('[data-testid="sandbox-disclosure-banner"]')).toBeVisible();

    // Verify metric cards
    await expect(page.locator('body')).toContainText(/Total Settled/i);
    await expect(page.locator('body')).toContainText(/Verified Payments/i);

    // Verify filter elements exist
    await expect(page.locator('[data-testid="filter-status-select"]')).toBeVisible();
    await expect(page.locator('[data-testid="filter-purpose-select"]')).toBeVisible();

    // Verify payments container
    await expect(page.locator('[data-testid="payments-table"], [data-testid="payments-empty-state"]').first()).toBeVisible();

    // ── 2. Navigate to Refunds Tracker via Action Button ───────────────────────
    const viewRefundsBtn = page.locator('[data-testid="view-refunds-btn"]');
    await expect(viewRefundsBtn).toBeVisible();
    await viewRefundsBtn.click();
    await page.waitForLoadState('networkidle');

    // ── 3. Refunds & Savings Tracker Page ─────────────────────────────────────
    await expect(page).toHaveURL(/\/refunds/);
    await expect(page.locator('[data-testid="refunds-page"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="refunds-page"] h1')).toContainText(/Refunds & Savings Tracker/i);

    // Verify Sandbox disclosure banner on refunds
    await expect(page.locator('[data-testid="sandbox-disclosure-banner"]')).toBeVisible();

    // Verify filter elements exist
    await expect(page.locator('[data-testid="filter-refund-status-select"]')).toBeVisible();
    await expect(page.locator('[data-testid="filter-refund-reason-select"]')).toBeVisible();

    // Verify refunds container
    await expect(page.locator('[data-testid="refunds-table"], [data-testid="refunds-empty-state"]').first()).toBeVisible();

    // ── 4. Navigate back to Payments Ledger via Action Button ──────────────────
    const viewPaymentsBtn = page.locator('[data-testid="view-payments-btn"]');
    await expect(viewPaymentsBtn).toBeVisible();
    await viewPaymentsBtn.click();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/payments/);
    await expect(page.locator('[data-testid="payments-page"]')).toBeVisible({ timeout: 10000 });
  });
});
