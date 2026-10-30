# Engineering Task Specification — Suraj

**Role:** Frontend Lead — Group-Buy Pools, 72h/24h Decision Workflows, PayPal Sandbox Checkout, Orders, Supplier/Admin Portals & Playwright E2E Testing  
**Assigned Tasks:** 10 Tasks (`SUJ-01` to `SUJ-10` out of 50 Total Tasks)

---

## 1. Zero-Collision Ownership & Parallel Work Contract

To ensure your work never collides with **Prakhar**, **Sahil**, **Srujan**, or **Himanshu**, you own the following exclusive directories and files:

- `client/src/utils/money.js`, `moqMath.js`
- `client/src/components/common/ProvenanceBadge.jsx`, `SandboxDisclosureBanner.jsx`, `CountdownTimer.jsx`, `MOQStepCalculator.jsx`, `TierProgressBar.jsx`, `PriceBreakdownLedger.jsx`, `ActivityTimeline.jsx`
- `client/src/api/pools.api.js`, `payments.api.js`, `orders.api.js`, `admin.api.js`
- `client/src/pages/groupBuys/GroupBuyMarketplacePage.jsx`, `GroupBuyCreatePage.jsx`, `GroupBuyDetailPage.jsx`, `PoolApprovalPage.jsx`, `UnderMOQDecisionPage.jsx`
- `client/src/pages/payments/PayPalCheckoutModal.jsx`, `PaymentsPage.jsx`, `RefundsPage.jsx`
- `client/src/pages/orders/OrdersListPage.jsx`, `OrderDetailPage.jsx`
- `client/src/pages/notifications/NotificationsPage.jsx`
- `client/src/pages/supplierPortal/SupplierPortalPage.jsx`
- `client/src/pages/admin/AdminDashboardPage.jsx`, `AdminSuppliersPage.jsx`, `AdminOffersPage.jsx`, `AdminPoolsOrdersPage.jsx`, `AdminAuditLogsPage.jsx`
- `client/src/App.jsx` (Route registration table connecting Himanshu's and Suraj's pages)
- `e2e/procurementWorkflow.spec.js`, `e2e/underMoqWorkflow.spec.js`, `playwright.config.js`

---

## 2. Detailed 10-Task Breakdown for Suraj

### Task `SUJ-01`: Reusable Financial, MOQ/Step Calculator, Tier Progress & 72h/24h Countdown Widgets

- **Exclusive Files:**
  - `client/src/utils/money.js`
  - `client/src/utils/moqMath.js`
  - `client/src/components/common/ProvenanceBadge.jsx`
  - `client/src/components/common/SandboxDisclosureBanner.jsx`
  - `client/src/components/common/CountdownTimer.jsx`
  - `client/src/components/common/MOQStepCalculator.jsx`
  - `client/src/components/common/TierProgressBar.jsx`
  - `client/src/components/common/PriceBreakdownLedger.jsx`
  - `client/src/components/common/ActivityTimeline.jsx`
- **Implementation Details:**
  1. `MOQStepCalculator.jsx`: Interactive quantity input with $+/-$ step buttons that enforces **Retailer Minimum MOQ ($MOQ_R = 20\%$ of $MOQ_W$)** and **Step Multiple ($\text{Step} = 1\%$ of $MOQ_W$)**, showing live unit price tier, estimated merchandise share, and instant validation feedback (e.g., _"Minimum 200 units, in multiples of 10"_).
  2. `CountdownTimer.jsx`: Displays authoritative server-synced countdown (`DD:HH:MM:SS`) for both the 72-hour MOQ deadline and the 24-hour under-MOQ decision window.
  3. `TierProgressBar.jsx`: Visual progress bar showing $Q_{\text{pool}}$ vs. $MOQ_W$ and markers for each bulk discount tier ($₹100 \rightarrow ₹90 \rightarrow ₹80$).
  4. `PriceBreakdownLedger.jsx`: Renders itemized merchandise share, shipping share (`PER_UNIT` / `EQUAL_SHARE` or `EXCLUDED`), rounding adjustment, verified savings, and total payable in formatted minor units (`tabular-nums`).
- **Verification & Tests:** Unit tests for `money.js`, `moqMath.js`, and widget rendering.

---

### Task `SUJ-02`: Group-Buy Marketplace (`/group-buys`) & Pool Creation Page (`/group-buys/create`)

- **Exclusive Files:**
  - `client/src/api/pools.api.js`
  - `client/src/pages/groupBuys/GroupBuyMarketplacePage.jsx`
  - `client/src/pages/groupBuys/GroupBuyCreatePage.jsx`
- **Implementation Details:**
  1. Build `GroupBuyMarketplacePage.jsx` listing active and locked pools with filters for category, delivery area, and pool status, showing $Q_{\text{pool}} / MOQ_W$, current bulk tier price, $MOQ_R$, $\text{Step}$, participant count, 72h countdown, and provenance badge.
  2. Build `GroupBuyCreatePage.jsx` allowing a shop owner to select a `CONFIRMED` requirement and compatible `SupplierOffer`, enter their initial contribution quantity (validated via `MOQStepCalculator`), and publish a new 72-hour pool.
- **Verification & Tests:** Component test verifying pool marketplace filtering and pool creation validation.

---

### Task `SUJ-03`: Group-Buy Pool Detail Page (`/group-buys/:poolId`) — Join, Pre-Lock Edit & Withdraw Workflows

- **Exclusive Files:**
  - `client/src/pages/groupBuys/GroupBuyDetailPage.jsx`
- **Implementation Details:**
  1. Display complete pool header: product specs, supplier offer provenance, 72-hour live countdown, lock status (`RECRUITING` vs. `MOQ_REACHED_EARLY` vs. `EXPIRED_72H_UNDER_MOQ`), and `TierProgressBar`.
  2. **Join Pool Panel:** Allows eligible shop owners to select their confirmed requirement, pick a valid quantity ($Q_i \ge MOQ_R$, multiple of $\text{Step}$), check substitution consent if applicable, and complete PayPal Sandbox checkout.
  3. **Customization & Withdrawal Panel (Open Window Only):** While `pool.state === 'RECRUITING'` ($Q_{\text{pool}} < MOQ_W$ and $< 72\text{h}$), allow active participants to:
     - **Increase Quantity:** Shows exact delta payable amount and opens PayPal Sandbox checkout to confirm and pay the difference.
     - **Decrease Quantity ($\ge MOQ_R$) or Withdraw:** Opens confirmation dialog and triggers automatic backend refund + pool recalculation.
  4. Render participant contribution table, `PriceBreakdownLedger`, and chronological `ActivityTimeline`.
- **Verification & Tests:** Component test verifying join, edit, and withdraw controls disable automatically once the pool locks.

---

### Task `SUJ-04`: Versioned Price Snapshot Review & Explicit Participant Approval Page (`/group-buys/:poolId/approve`)

- **Exclusive Files:**
  - `client/src/pages/groupBuys/PoolApprovalPage.jsx`
- **Implementation Details:**
  1. Display the frozen versioned `PriceSnapshot` (`version`, timestamp, supplier offer terms, cancellation policy, quote validity, and itemized `PriceBreakdownLedger`).
  2. Show the buyer's exact reconciliation summary:
     - Total Payable under Frozen Snapshot vs. Amount Already Paid at Join.
     - If bulk tier unlocking reduced the price $\rightarrow$ highlight the **Automatic Tier-Savings Refund Amount** to be credited on approval.
     - If a balance or surcharge is due $\rightarrow$ show the exact balance payable via PayPal Sandbox after approval.
  3. Provide the explicit **"I Review and Approve Final Cost Breakdown (Snapshot vX)"** button (`POST /api/pools/:id/approve`).
  4. Display a prominent alert if a prior approval was marked `INVALIDATED_BY_CHANGE` due to a revised quote or cost change.
- **Verification & Tests:** Component test verifying snapshot approval submission and invalidated-approval warning banner.

---

### Task `SUJ-05`: 24-Hour Under-MOQ Buyer Decision Page (`/group-buys/:poolId/decision`)

- **Exclusive Files:**
  - `client/src/pages/groupBuys/UnderMOQDecisionPage.jsx`
- **Implementation Details:**
  1. Built specifically for pools that expired at 72 hours below $MOQ_W$ (`state === 'UNDER_MOQ_DECISION_PENDING'`).
  2. Display:
     - Live **24-Hour Decision Window Countdown** (`decisionDeadline`) with warning that non-response is never treated as consent and will auto-cancel/refund.
     - Achieved Quantity ($Q_{\text{pool}}$) vs. Wholesaler MOQ ($MOQ_W$) and exact shortfall.
     - Supplier Under-MOQ Feasibility Status (`AWAITING_SUPPLIER`, `ACCEPTED_SUB_MOQ`, `REVISED_QUOTE_PROVIDED`, `REJECTED_SUB_MOQ`).
     - Current vs. Revised Unit Cost and Shipping Share comparison.
     - **AI Under-MOQ Recommendation Card** showing `suggestedAction`, data-grounded explanation, supporting cost/quantity figures, and explicit `uncertainties`.
  3. Render two explicit action buttons with confirmation dialogs:
     - **Proceed with the proposed order** (`PROCEED`)
     - **Cancel my participation & request full refund** (`CANCEL`)
- **Verification & Tests:** Component test verifying Proceed/Cancel actions and AI advisory rendering.

---

### Task `SUJ-06`: PayPal Sandbox Checkout Modal (`TEST TRANSACTION`), Payments Ledger & Refunds Tracker (`/payments`, `/refunds`)

- **Exclusive Files:**
  - `client/src/api/payments.api.js`
  - `client/src/pages/payments/PayPalCheckoutModal.jsx`
  - `client/src/pages/payments/PaymentsPage.jsx`
  - `client/src/pages/payments/RefundsPage.jsx`
- **Implementation Details:**
  1. `PayPalCheckoutModal.jsx`: Integrates `@paypal/react-paypal-js` (plus a clearly badged `SIMULATED DEV CHECKOUT` button when `PAYMENT_MODE=mock`), calls `POST /api/payments/create-order` and `POST /api/payments/:paymentId/capture`, and displays a prominent `TEST TRANSACTION — PAYPAL SANDBOX` badge.
  2. `PaymentsPage.jsx`: Displays all buyer payments (`INITIAL_JOIN`, `QUANTITY_INCREASE_DELTA`, `POST_APPROVAL_FINAL`, `UNDER_MOQ_SURCHARGE`), provider order/capture IDs, and verified statuses.
  3. `RefundsPage.jsx`: Displays all buyer refunds with live status badges (`REQUESTED`, `PROCESSING`, `COMPLETED`, `FAILED`), refund reasons (withdrawal, quantity reduction, tier-drop savings, under-MOQ cancel/no-response), and timestamps.
- **Verification & Tests:** Component test verifying checkout modal states (loading, success, cancelled, failed) and refund table rendering.

---

### Task `SUJ-07`: Orders List, Order Detail (`SIMULATED` Settlement Badge & PO Download) & Notifications Page (`/orders`, `/orders/:orderId`, `/notifications`)

- **Exclusive Files:**
  - `client/src/api/orders.api.js`
  - `client/src/pages/orders/OrdersListPage.jsx`
  - `client/src/pages/orders/OrderDetailPage.jsx`
  - `client/src/pages/notifications/NotificationsPage.jsx`
- **Implementation Details:**
  1. `OrdersListPage.jsx`: Lists finalized orders with order number (`AKD-2026-XXXX`), total quantity, grand total, supplier confirmation status, and delivery state.
  2. `OrderDetailPage.jsx`: Displays product & supplier details, authorized participant allocations, approved pricing breakdown, buyer payment statuses, **Separate Supplier Settlement Status Card** (`SIMULATED`, `PENDING`, `CONFIRMED` with explicit demo disclosure), **Download Purchase Order (PO) Summary** button, and chronological `ActivityTimeline`.
  3. `NotificationsPage.jsx`: Full notification center with filter by unread/type, mark-as-read buttons, and deep links to pools/orders.
- **Verification & Tests:** Component test verifying separate buyer payment vs. `SIMULATED` supplier settlement badges.

---

### Task `SUJ-08`: Wholesaler Supplier Portal UI (`/supplier-portal`)

- **Exclusive Files:**
  - `client/src/pages/supplierPortal/SupplierPortalPage.jsx`
- **Implementation Details:**
  1. Build the dedicated Wholesaler Workspace with 4 tabs:
     - **My Catalogue Offers:** Create/edit `SupplierOffer` records including $MOQ_W$, Retailer MOQ $\%$ ($p_{\min}$), Step $\%$ ($p_{\text{step}}$), quantity price tiers, shipping terms, and quote expiry.
     - **Incoming Quote Requests:** Respond to custom quote requests (`PATCH /api/quotes/:id/respond`).
     - **Under-MOQ Pool Feasibility Requests:** Accept sub-MOQ pools at current tier, submit a revised quote for the achieved quantity, or reject sub-MOQ pools (`POST /api/pools/:id/supplier-feasibility`).
     - **Purchase Orders & Fulfilment:** Confirm or reject finalized group orders and update shipping/delivery status (`PATCH /api/orders/:id/supplier-status`).
- **Verification & Tests:** Component test verifying offer creation and sub-MOQ feasibility submission.

---

### Task `SUJ-09`: Platform Administrator Workspace & Audit Log Inspector UI (`/admin/*`)

- **Exclusive Files:**
  - `client/src/api/admin.api.js`
  - `client/src/pages/admin/AdminDashboardPage.jsx`
  - `client/src/pages/admin/AdminSuppliersPage.jsx`
  - `client/src/pages/admin/AdminOffersPage.jsx`
  - `client/src/pages/admin/AdminPoolsOrdersPage.jsx`
  - `client/src/pages/admin/AdminAuditLogsPage.jsx`
- **Implementation Details:**
  1. `AdminDashboardPage.jsx`: Operational health overview, stalled pool alerts, payment/refund exception counts, AI error counts, and a **"Run 72h/24h Lifecycle Check Now"** trigger button for live demos.
  2. `AdminSuppliersPage.jsx` & `AdminOffersPage.jsx`: Full supplier/offer moderation, provenance badge assignment (`SEEDED_DEMO`, `VERIFIED_LIVE`), and quote verification.
  3. `AdminPoolsOrdersPage.jsx`: Inspect stalled/expired pools, view payment reconciliation details, and add reconciliation notes without overwriting historical payment captures.
  4. `AdminAuditLogsPage.jsx`: Searchable, filterable data grid of immutable `AuditLog` and `AIExecutionLog` records.
- **Verification & Tests:** Component test verifying admin tables and read-only enforcement when viewed by a `REVIEWER`.

---

### Task `SUJ-10`: Playwright End-to-End (E2E) Test Suite & 3-Shop Hackathon Demo Verification (`e2e/`)

- **Exclusive Files:**
  - `playwright.config.js`
  - `e2e/procurementWorkflow.spec.js`
  - `e2e/underMoqWorkflow.spec.js`
- **Implementation Details:**
  1. Write automated Playwright E2E tests covering the complete connected procurement journey:
     - **E2E Suite 1 (`procurementWorkflow.spec.js`):** Sign in as Shop A $\rightarrow$ submit requirement & confirm AI extraction $\rightarrow$ compare supplier offers $\rightarrow$ join pool (verifying $MOQ_R$ and $\text{Step}$ validation rejects invalid quantities and accepts valid ones) $\rightarrow$ complete PayPal Sandbox/test checkout $\rightarrow$ reach MOQ ($20+15+25=60\text{ boxes} \rightarrow ₹4,800$) $\rightarrow$ approve versioned `PriceSnapshot` $\rightarrow$ inspect confirmed `Order`, `SIMULATED` supplier settlement badge, and activity timeline.
     - **E2E Suite 2 (`underMoqWorkflow.spec.js`):** Advance server clock $+72\text{ hours}$ on an under-MOQ pool $\rightarrow$ verify pool locks into `UNDER_MOQ_DECISION_PENDING` $\rightarrow$ inspect AI under-MOQ recommendation $\rightarrow$ test buyer `PROCEED` and `CANCEL` decisions and verify refund creation in `/refunds`.
- **Verification & Tests:** Run `npx playwright test` against the full running frontend and backend stack.
