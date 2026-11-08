import { test, expect } from '@playwright/test';

/**
 * End-to-End Test Suite:
 * 1. Admin Workspace Complete Management & Reconciliation
 * 2. Kirana AI Assistant Chatbot Interactivity
 * 3. Verification of AI Intake & Review Removal from User Navigation
 */

test.describe('Admin Workspace, Chatbot & Navigation Verification', () => {

  test('Admin Workspace: Metrics, Lifecycle Trigger, Suppliers, Offers, Pools, and Audit/AI Logs', async ({ page }) => {
    // ── 1. Sign In as Platform Admin ──────────────────────────────────────────
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const adminDemoBtn = page.locator('button[aria-label*="Sign in as Admin"]');
    if (await adminDemoBtn.isVisible()) {
      await adminDemoBtn.click();
    } else {
      await page.fill('#login-email', 'admin@demo.aapkidukan.in');
      await page.fill('#login-password', 'SecurePassword123!');
      await page.click('button[type="submit"]');
      const otpInput = page.locator('#otp-login-code');
      if (await otpInput.isVisible()) {
        await otpInput.fill('123456');
        await page.click('button[type="submit"]');
      }
    }

    // Admin lands directly on /admin
    await page.waitForURL((url) => url.pathname.includes('/admin'), { timeout: 15000 });
    await expect(page.locator('[data-testid="admin-dashboard-page"]')).toBeVisible({ timeout: 10000 });

    // ── 2. Verify Operational Health Metrics & Badges ─────────────────────────
    await expect(page.locator('[data-testid="admin-dashboard-page"] h1')).toContainText('Platform Operations & Moderation');
    await expect(page.locator('body')).toContainText(/ADMIN ACCESS/i);
    await expect(page.locator('body')).toContainText(/Stalled Pools/i);
    await expect(page.locator('body')).toContainText(/Attention Payments/i);
    await expect(page.locator('body')).toContainText(/Total Suppliers/i);

    // ── 3. Test "Run 72h/24h Lifecycle Check" Action ──────────────────────────
    const triggerLifecycleBtn = page.locator('[data-testid="trigger-lifecycle-btn"]');
    await expect(triggerLifecycleBtn).toBeVisible();
    await triggerLifecycleBtn.click();

    // Verify modal appears
    await expect(page.locator('text=Run 72h/24h Pool Lifecycle Scheduler')).toBeVisible();
    const runBtn = page.locator('button:has-text("Confirm & Run Lifecycle Check")');
    await expect(runBtn).toBeVisible();
    await runBtn.click();

    // Verify completion message
    await expect(page.locator('text=Previous Run Outcome:')).toBeVisible({ timeout: 10000 });
    const cancelModalBtn = page.locator('button:has-text("Cancel")');
    if (await cancelModalBtn.isVisible()) {
      await cancelModalBtn.click();
    }

    // ── 4. Navigate to Manage Suppliers (/admin/suppliers) ────────────────────
    await page.click('button:has-text("Suppliers")');
    await page.waitForURL((url) => url.pathname.includes('/admin/suppliers'), { timeout: 10000 });
    await expect(page.locator('[data-testid="admin-suppliers-page"]')).toBeVisible();

    await expect(page.locator('[data-testid="admin-suppliers-page"] h1')).toContainText('Supplier Verification & Provenance');
    await expect(page.locator('body')).toContainText(/North India EcoPack Wholesalers|Ganga FMCG/i);

    // ── 5. Navigate to Manage Offers (/admin/offers) ──────────────────────────
    await page.click('button:has-text("Catalogue Offers")');
    await page.waitForURL((url) => url.pathname.includes('/admin/offers'), { timeout: 10000 });
    await expect(page.locator('[data-testid="admin-offers-page"]')).toBeVisible();

    await expect(page.locator('[data-testid="admin-offers-page"] h1')).toContainText('Catalogue Offer Moderation');
    await expect(page.locator('body')).toContainText(/Wholesale MOQ/i);

    // ── 6. Navigate to Pools & Reconciliation (/admin/pools) ──────────────────
    await page.click('button:has-text("Pools & Reconciliation")');
    await page.waitForURL((url) => url.pathname.includes('/admin/pools'), { timeout: 10000 });
    await expect(page.locator('[data-testid="admin-pools-orders-page"]')).toBeVisible();

    await expect(page.locator('[data-testid="admin-pools-orders-page"] h1')).toContainText('Pools & Payment Reconciliation Workspace');

    // Switch between reconciliation workspace tabs
    await page.click('button:has-text("Stalled Pools")');
    await expect(page.locator('body')).toContainText(/Stalled Pools|Under-MOQ/i);

    await page.click('button:has-text("Failed Refunds")');
    await expect(page.locator('body')).toContainText(/Failed Refunds/i);

    await page.click('button:has-text("Attention Payments")');

    // ── 7. Navigate to Audit & AI Logs (/admin/audit) ─────────────────────────
    await page.click('button:has-text("Audit Logs")');
    await page.waitForURL((url) => url.pathname.includes('/admin/audit'), { timeout: 10000 });
    await expect(page.locator('[data-testid="admin-audit-logs-page"]')).toBeVisible();

    await expect(page.locator('[data-testid="admin-audit-logs-page"] h1')).toContainText('Platform Audit Trail');
    await expect(page.locator('body')).toContainText(/Audit Trail Records/i);
    await expect(page.locator('body')).toContainText(/AI Execution Traces/i);

    // Test tab switch to AI Execution Traces
    await page.click('button:has-text("AI Execution Traces")');
    await page.waitForTimeout(500);

    // Switch back to Audit Trail
    await page.click('button:has-text("Audit Trail Records")');
    await page.waitForTimeout(500);
  });

  test('Kirana AI Assistant Chatbot: Floating Widget, Interactive Query & Response', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // ── 1. Check Floating Chatbot Button ──────────────────────────────────────
    const triggerBtn = page.locator('[data-testid="chatbot-trigger-btn"]');
    await expect(triggerBtn).toBeVisible({ timeout: 10000 });
    await expect(triggerBtn).toContainText(/Kirana AI/i);

    // ── 2. Open Chatbot Window ────────────────────────────────────────────────
    await triggerBtn.click();
    const chatWindow = page.locator('[data-testid="chatbot-window"]');
    await expect(chatWindow).toBeVisible({ timeout: 5000 });
    await expect(chatWindow).toContainText('Aap Ki Dukan Copilot');

    // ── 3. Send Query via Prompt Suggestion Chip ──────────────────────────────
    const chipBtn = page.locator('button:has-text("How does Group Buying save money?")').first();
    if (await chipBtn.isVisible()) {
      await chipBtn.click();
    } else {
      await page.fill('[data-testid="chatbot-input"]', 'How does Group Buying save money?');
      await page.click('[data-testid="chatbot-send-btn"]');
    }

    // ── 4. Verify AI Response ────────────────────────────────────────────────
    const messagesContainer = page.locator('[data-testid="chatbot-messages"]');
    await expect(messagesContainer).toContainText(/wholesale|MOQ|tier|refund/i, { timeout: 10000 });

    // ── 5. Ask another specific question via input ───────────────────────────
    await page.fill('[data-testid="chatbot-input"]', 'What is the 20% Retailer MOQ rule?');
    await page.click('[data-testid="chatbot-send-btn"]');
    await expect(messagesContainer).toContainText(/20%|Retailer MOQ|stepping/i, { timeout: 10000 });

    // ── 6. Minimize Chatbot ──────────────────────────────────────────────────
    const closeBtn = page.locator('[data-testid="chatbot-close-btn"]');
    await closeBtn.click();
    await expect(chatWindow).not.toBeVisible();
    await expect(triggerBtn).toBeVisible();
  });

  test('Verify AI Intake & Review is Removed from Navigation and Dashboard', async ({ page }) => {
    // ── 1. Sign In as Shop A ─────────────────────────────────────────────────
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const shopADemoBtn = page.locator('button[aria-label*="Sign in as Shop A"]');
    if (await shopADemoBtn.isVisible()) {
      await shopADemoBtn.click();
    }

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    // ── 2. Verify Sidebar Navigation has NO "Requirements" Link ──────────────
    const navItems = page.locator('nav a, nav button, [role="navigation"] a');
    const allNavText = await navItems.allInnerTexts();
    expect(allNavText.some((text) => text.trim() === 'Requirements')).toBeFalsy();

    // ── 3. Verify Dashboard Action Bar has NO "+ New Requirement" Button ─────
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const newReqBtn = page.locator('button:has-text("New Requirement")');
    expect(await newReqBtn.count()).toBe(0);

    // Verify it has "Explore Group Buys" instead
    await expect(page.locator('button:has-text("Explore Group Buys")').first()).toBeVisible();

    // ── 4. Verify Chatbot is accessible on Dashboard ─────────────────────────
    await expect(page.locator('[data-testid="chatbot-trigger-btn"]')).toBeVisible();
  });

});
