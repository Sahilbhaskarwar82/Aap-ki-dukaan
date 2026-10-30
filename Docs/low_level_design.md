# Low-Level Design (LLD) — Aap Ki Dukan (CoBuy AI)

---

## 1. Repository & Source Code File Map

```text
cobuy-ai/
├── client/                                         # React + Vite Frontend
│   ├── public/
│   ├── src/
│   │   ├── api/
│   │   │   ├── axiosClient.js                      # Axios instance, JWT interceptor, X-Correlation-Id header
│   │   │   ├── auth.api.js                         # register, login, logout, getMe, updateShopProfile
│   │   │   ├── requirements.api.js                 # CRUD requirements, uploadDocument, importCsv, runAiExtract
│   │   │   ├── suppliers.api.js                    # searchSuppliers, searchOffers, compareOffers, requestQuote
│   │   │   ├── pools.api.js                        # CRUD pools, join, editContribution, withdraw, approveSnapshot, submitUnderMoqDecision
│   │   │   ├── payments.api.js                     # createPayPalOrder, capturePayPalOrder, listPayments, listRefunds
│   │   │   ├── orders.api.js                       # listOrders, getOrderDetail, downloadPoSummary, updateSupplierOrderStatus
│   │   │   ├── notifications.api.js                # listNotifications, markNotificationRead
│   │   │   └── admin.api.js                        # admin CRUD, reconciliation, runLifecycleJobs, listAuditLogs
│   │   ├── components/
│   │   │   ├── ui/                                 # Reusable shadcn/ui components (Button, Dialog, Table, Badge, Tabs, Alert, Skeleton)
│   │   │   ├── common/
│   │   │   │   ├── ProvenanceBadge.jsx             # Renders SEEDED_DEMO, SUPPLIER_SUBMITTED, VERIFIED_LIVE badges
│   │   │   │   ├── SandboxDisclosureBanner.jsx     # Renders TEST TRANSACTION & SIMULATED SETTLEMENT banners
│   │   │   │   ├── CountdownTimer.jsx              # Server-synced 72h MOQ timer & 24h decision countdown
│   │   │   │   ├── MOQStepCalculator.jsx           # Interactive calculator enforcing MOQ_W, MOQ_R (20%), and Step (1%)
│   │   │   │   ├── TierProgressBar.jsx             # Visual progress toward MOQ_W and bulk price tiers
│   │   │   │   ├── PriceBreakdownLedger.jsx        # Itemized merchandise, shipping, tax notes, rounding & savings table
│   │   │   │   └── ActivityTimeline.jsx            # Chronological audit & lifecycle event timeline
│   │   ├── context/
│   │   │   ├── AuthContext.jsx                     # Authenticated user, Shop/Supplier profile, role permission helpers
│   │   │   └── NotificationContext.jsx             # Unread notification counter & toast alerts
│   │   ├── layouts/
│   │   │   ├── PublicLayout.jsx                    # Marketing header & footer
│   │   │   └── AppShellLayout.jsx                  # Authenticated sidebar, topbar, role badge, notification drawer
│   │   ├── pages/
│   │   │   ├── public/
│   │   │   │   └── LandingPage.jsx                 # Problem statement, AI + MOQ workflow, transparent pricing preview, CTAs
│   │   │   ├── auth/
│   │   │   │   ├── LoginPage.jsx                   # Login form + Demo Account quick-fill buttons
│   │   │   │   └── RegisterPage.jsx                # Role-aware registration (Retailer Shop / Wholesaler)
│   │   │   ├── dashboard/
│   │   │   │   ├── BuyerDashboardPage.jsx          # Active pools, MOQ progress, countdowns, pending decisions/approvals
│   │   │   │   └── ProfilePage.jsx                 # Shop & Supplier profile management
│   │   │   ├── requirements/
│   │   │   │   ├── RequirementsListPage.jsx
│   │   │   │   ├── RequirementCreatePage.jsx       # Structured form, NL text, Invoice/PDF upload, CSV import
│   │   │   │   └── RequirementDetailPage.jsx       # AI extraction vs confirmed diff, uncertainty badges, edit/confirm, candidate matches
│   │   │   ├── suppliers/
│   │   │   │   ├── SupplierCataloguePage.jsx       # Search, filter, sort, side-by-side offer comparison table
│   │   │   │   └── SupplierDetailPage.jsx          # Supplier profile, tiered offers, custom quote request
│   │   │   ├── groupBuys/
│   │   │   │   ├── GroupBuyMarketplacePage.jsx     # Discover eligible pools with filters
│   │   │   │   ├── GroupBuyCreatePage.jsx          # Create pool from confirmed requirement + compatible offer
│   │   │   │   ├── GroupBuyDetailPage.jsx          # Pool overview, 72h timer, MOQ/Step input, join/edit/withdraw, activity log
│   │   │   │   ├── PoolApprovalPage.jsx            # Explicit review & approval of frozen versioned PriceSnapshot
│   │   │   │   └── UnderMOQDecisionPage.jsx        # 24h Proceed/Cancel voting, AI advisory, revised quote approval
│   │   │   ├── payments/
│   │   │   │   ├── PayPalCheckoutModal.jsx         # PayPal Sandbox Buttons + server-side capture verification
│   │   │   │   ├── PaymentsPage.jsx                # Payment ledger (initial joins, delta adjustments, surcharges)
│   │   │   │   └── RefundsPage.jsx                 # Refund status tracker (Requested, Processing, Completed, Failed)
│   │   │   ├── orders/
│   │   │   │   ├── OrdersListPage.jsx
│   │   │   │   └── OrderDetailPage.jsx             # Member shares, separate SupplierSettlement badge, PO download, timeline
│   │   │   ├── notifications/
│   │   │   │   └── NotificationsPage.jsx
│   │   │   ├── supplierPortal/
│   │   │   │   └── SupplierPortalPage.jsx          # Wholesaler offer CRUD, quote responses, sub-MOQ feasibility, order confirmation
│   │   │   └── admin/
│   │   │       ├── AdminDashboardPage.jsx
│   │   │       ├── AdminSuppliersPage.jsx
│   │   │       ├── AdminOffersPage.jsx
│   │   │       ├── AdminPoolsOrdersPage.jsx        # Stalled pool & payment reconciliation workspace
│   │   │       └── AdminAuditLogsPage.jsx          # Immutable AuditLog & AIExecutionLog inspector
│   │   ├── utils/
│   │   │   ├── money.js                            # Minor unit formatter (e.g., 480000 paise -> ₹4,800.00)
│   │   │   └── moqMath.js                          # Client preview helper for MOQ_R and Step multiples
│   │   └── tests/
│   └── package.json
├── server/                                         # Node.js + Express Backend
│   ├── src/
│   │   ├── config/
│   │   │   ├── env.js                              # Startup Zod validation of .env variables
│   │   │   └── db.js                               # Mongoose connection & withTransaction() helper
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js                  # authenticateJWT, requireRoles(), verifyResourceOwnership()
│   │   │   ├── rateLimiter.middleware.js           # Endpoint rate limiters (auth, uploads, AI, payments)
│   │   │   ├── upload.middleware.js                # Multer MIME/magic-byte check, 10MB limit, UUID filename generator
│   │   │   ├── correlationId.middleware.js         # Generates/propagates X-Correlation-Id
│   │   │   └── error.middleware.js                 # Safe centralized error response handler
│   │   ├── models/                                 # 18 Mongoose Models (Full schemas in database_schemas.md)
│   │   ├── services/
│   │   │   ├── clock/
│   │   │   │   └── clock.service.js                # Injectable clock (real time vs test-controlled offset)
│   │   │   ├── ai/
│   │   │   │   ├── aiAdapter.service.js            # Provider wrapper, timeouts, retries, AIExecutionLog persistence
│   │   │   │   ├── extraction.service.js           # extractRequirement() & normalizeProduct() with Zod validation
│   │   │   │   ├── matching.service.js             # matchProducts() with hard unit/spec compatibility checks
│   │   │   │   └── advisory.service.js             # summarizeQuotes() & recommendUnderMOQAction()
│   │   │   ├── supplierSearch/
│   │   │   │   └── catalogue.service.js            # Offer search, hard-constraint filtering, landed-cost comparison
│   │   │   ├── pricing/
│   │   │   │   ├── moqValidator.service.js         # Enforces Wholesaler MOQ_W, Retailer MOQ_R (20%), Step (1%)
│   │   │   │   ├── pricingEngine.service.js        # Deterministic tier selection, shipping allocation, paise rounding
│   │   │   │   └── snapshot.service.js             # Freezes versioned PriceSnapshot & invalidates stale approvals
│   │   │   ├── groupBuy/
│   │   │   │   ├── poolLifecycle.service.js        # Pool creation, join, edit, withdraw, early MOQ lock, 72h expiry
│   │   │   │   └── underMoqDecision.service.js     # 24h decision window & all 10 under-MOQ resolution cases
│   │   │   ├── payments/
│   │   │   │   ├── paypalAdapter.service.js        # PayPal Sandbox Orders/Captures/Refunds API + Mock Dev Adapter
│   │   │   │   └── payment.service.js              # Server order creation, capture verification, webhooks, idempotency
│   │   │   ├── refunds/
│   │   │   │   └── refund.service.js               # Refund state machine (Requested -> Processing -> Completed / Failed)
│   │   │   ├── orders/
│   │   │   │   └── order.service.js                # Final Order creation, PO summary generator, SupplierSettlement tracker
│   │   │   └── notifications/
│   │   │       ├── notification.service.js         # Persistent in-app notifications & optional email dispatch
│   │   │       └── audit.service.js                # Immutable AuditLog writer
│   │   ├── jobs/
│   │   │   └── poolScheduler.job.js                # Evaluates 72h pool deadlines, 24h decision cutoffs, quote expiries
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── validators/
│   │   ├── utils/
│   │   │   └── seedDemoData.js                     # Repeatable database seeder
│   │   └── app.js
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── fixtures/
│   └── package.json
├── e2e/                                            # Playwright End-to-End Tests
├── docs/                                           # 12 Mandatory Documentation Files
├── .env.example
├── .gitignore
├── LICENSE
└── README.md
```

---

## 2. Frontend Route Architecture & Component Responsibilities

| Frontend Route | Page Component | Permitted Roles | Primary User Actions & Backend Integration |
| :--- | :--- | :--- | :--- |
| `/` | `LandingPage` | Public | Explains group procurement, AI extraction, two-level MOQ rules, bulk tier savings, and Sign In / Register CTAs. |
| `/register` | `RegisterPage` | Public | Creates `User` + `Shop` (or `Supplier`) via `POST /api/auth/register`. |
| `/login` | `LoginPage` | Public | Authenticates via `POST /api/auth/login`; provides one-click Demo Account fill in demo mode. |
| `/dashboard` | `BuyerDashboardPage` | `SHOP_OWNER`, `REVIEWER` | Displays active pools, MOQ progress bars, 72h/24h countdowns, pending approvals/decisions, payments, and recent orders. |
| `/profile` | `ProfilePage` | Authenticated | Updates `Shop` or `Supplier` profile (`PATCH /api/shops/me`). |
| `/requirements` | `RequirementsListPage` | `SHOP_OWNER`, `ADMIN`, `REVIEWER` | Lists requirements with `DRAFT`, `NEEDS_REVIEW`, `CONFIRMED`, and `FAILED_EXTRACTION` badges. |
| `/requirements/new` | `RequirementCreatePage` | `SHOP_OWNER` | Submits requirement via structured form, natural-language text, invoice upload (`POST /api/uploads`), or CSV (`POST /api/requirements/import-csv`). |
| `/requirements/:requirementId` | `RequirementDetailPage` | Owner, `ADMIN`, `REVIEWER` | Compares AI-extracted vs. confirmed fields, highlights `uncertainFields`, allows editing & confirming (`PATCH /api/requirements/:id`), and triggers offer matching. |
| `/suppliers` | `SupplierCataloguePage` | Authenticated | Searches/filters suppliers and offers, shows provenance badges, and runs side-by-side landed-cost comparison (`POST /api/offers/compare`). |
| `/suppliers/:supplierId` | `SupplierDetailPage` | Authenticated | Displays supplier details, active offers, MOQ rules ($MOQ_W, MOQ_R, \text{Step}$), and custom quote request modal. |
| `/group-buys` | `GroupBuyMarketplacePage` | Authenticated | Lists open and locked pools with filters for category, delivery coverage, and lifecycle state. |
| `/group-buys/create` | `GroupBuyCreatePage` | `SHOP_OWNER`, `ADMIN` | Publishes a new 72-hour pool from a `CONFIRMED` requirement and compatible `SupplierOffer` (`POST /api/pools`). |
| `/group-buys/:poolId` | `GroupBuyDetailPage` | Authenticated | Shows live 72h countdown, $Q_{\text{pool}}$ vs. $MOQ_W$, Retailer MOQ ($20\%$) & Step ($1\%$) input validator, join/edit/withdraw actions, and chronological activity timeline. |
| `/group-buys/:poolId/approve` | `PoolApprovalPage` | `SHOP_OWNER` | Displays frozen versioned `PriceSnapshot` breakdown for explicit buyer approval (`POST /api/pools/:id/approve`) and any balance checkout. |
| `/group-buys/:poolId/decision` | `UnderMOQDecisionPage` | `SHOP_OWNER`, `ADMIN`, `REVIEWER` | 24-hour under-MOQ decision screen (`PROCEED` vs. `CANCEL`), AI recommendation with uncertainties, supplier feasibility, and revised quote approval. |
| `/payments` | `PaymentsPage` | `SHOP_OWNER`, `ADMIN`, `REVIEWER` | Shows buyer payment ledger, PayPal order/capture IDs, and `TEST TRANSACTION` badges. |
| `/refunds` | `RefundsPage` | `SHOP_OWNER`, `ADMIN`, `REVIEWER` | Tracks refund lifecycle (`REQUESTED`, `PROCESSING`, `COMPLETED`, `FAILED`) for withdrawals, tier drops, and cancellations. |
| `/orders` | `OrdersListPage` | Authenticated | Lists finalized group orders and fulfilment progress. |
| `/orders/:orderId` | `OrderDetailPage` | Participant, `SUPPLIER`, `ADMIN`, `REVIEWER` | Displays member shares, separate `SupplierSettlement` badge (`SIMULATED` / `PENDING` / `CONFIRMED`), PO download, and order activity log. |
| `/notifications` | `NotificationsPage` | Authenticated | Displays in-app notifications with read/unread toggles and target page links. |
| `/supplier-portal` | `SupplierPortalPage` | `SUPPLIER`, `ADMIN` | Manages supplier catalogue offers, responds to quote requests, submits sub-MOQ feasibility/revised quotes, and confirms orders. |
| `/admin` | `AdminDashboardPage` | `ADMIN`, `REVIEWER` | Operational overview of pools, orders, stalled payments, failed refunds, and AI errors. |
| `/admin/suppliers` | `AdminSuppliersPage` | `ADMIN` | Admin supplier CRUD, verification status, and provenance management. |
| `/admin/offers` | `AdminOffersPage` | `ADMIN` | Admin product and offer CRUD, MOQ/step tuning, and quote freshness controls. |
| `/admin/group-buys` | `AdminPoolsOrdersPage` | `ADMIN` | Inspects stalled/expired pools, triggers lifecycle jobs, and records payment reconciliation notes. |
| `/admin/audit-logs` | `AdminAuditLogsPage` | `ADMIN`, `REVIEWER` | Searches immutable `AuditLog` and `AIExecutionLog` records by correlation ID, actor, or resource. |

---

## 3. Complete Backend REST API Specification

Every endpoint validates input with Zod schemas, enforces authentication and RBAC in `auth.middleware.js`, checks resource ownership, and writes an `AuditLog` on state mutations.

### 3.1 Authentication & Business Profiles
* **`POST /api/auth/register`**
  * **Access:** Public | **Rate Limit:** 10 req / 15 min
  * **Request:** `{ name, email, password, role: 'SHOP_OWNER' | 'SUPPLIER', businessName, businessType, deliveryArea, deliveryAddress, contactPhone }`
  * **Validation & Logic:** Normalizes email, checks uniqueness, hashes password (`bcrypt`, cost 12), creates `User` + `Shop` (or `Supplier`) inside a transaction.
  * **Response (`201`):** `{ user, profile, token }`
* **`POST /api/auth/login`**
  * **Access:** Public | **Rate Limit:** 15 req / 15 min
  * **Request:** `{ email, password }`
  * **Response (`200`):** `{ user, profile, token }`
* **`POST /api/auth/logout`** $\rightarrow$ Invalidates active token/session (`200 OK`).
* **`GET /api/me`** $\rightarrow$ Returns authenticated `User` and associated `Shop` or `Supplier` (`200 OK`).
* **`PATCH /api/shops/me`** $\rightarrow$ Updates permitted `Shop` profile fields for `SHOP_OWNER` (`200 OK`).

### 3.2 Uploads, Purchasing Requirements & AI Extraction
* **`POST /api/uploads`**
  * **Access:** `SHOP_OWNER` | **Rate Limit:** 20 req / 15 min
  * **Request:** `multipart/form-data` (`file`: `PDF`, `PNG`, `JPG`, `WEBP`, `CSV`; size $\le 10\text{ MB}$).
  * **Logic:** Verifies extension and magic bytes, generates UUID storage key, writes to private storage, creates `UploadedDocument`.
  * **Response (`201`):** `{ documentId, originalFilename, mimeType, sizeBytes, status: 'STORED' }`
* **`GET /api/uploads/:id/download`** $\rightarrow$ Streams file to owner or `ADMIN` after ownership check.
* **`POST /api/requirements`**
  * **Access:** `SHOP_OWNER`
  * **Request:** `{ sourceType: 'FORM'|'TEXT'|'IMAGE'|'PDF', originalDescription?, uploadedDocumentId?, fields? }`
  * **Response (`201`):** Creates `Requirement` (`DRAFT` or `NEEDS_REVIEW`).
* **`POST /api/requirements/import-csv`** $\rightarrow$ Parses uploaded CSV into draft `Requirement` records (`201 Created`).
* **`POST /api/requirements/:id/extract`**
  * **Access:** Requirement Owner, `ADMIN` | **Rate Limit:** 15 req / 15 min
  * **Logic:** Sets status `PROCESSING`, calls `extractionService.extractRequirement()`, validates JSON response with Zod, populates `extractedFields`, `normalizedAttributes`, `uncertainFields`, and `confidenceScore`, writes `AIExecutionLog`, transitions requirement to `NEEDS_REVIEW` (or `FAILED_EXTRACTION` with `fallbackRequired: true`).
  * **Response (`200`):** `{ requirement, aiExecutionStatus, fallbackRequired }`
* **`PATCH /api/requirements/:id`**
  * **Access:** Requirement Owner
  * **Request:** `{ confirmedFields, status: 'DRAFT' | 'CONFIRMED' | 'REJECTED' }`
  * **Logic:** Validates required purchasing fields (product name, category, positive integer quantity, unit, delivery area). When `status === 'CONFIRMED'`, sets `confirmedByUserId` and `confirmedAt`.
* **`GET /api/requirements` & `GET /api/requirements/:id`** $\rightarrow$ Lists or fetches requirement details (enforcing owner check).

### 3.3 Supplier Catalogue, Matching & Quotes
* **`GET /api/suppliers` & `GET /api/suppliers/:id`** $\rightarrow$ Lists and inspects suppliers with provenance badges.
* **`GET /api/products/search`** $\rightarrow$ Searches canonical products by name, category, and specifications.
* **`GET /api/offers/search`**
  * **Access:** Authenticated
  * **Query:** `?requirementId=&category=&deliveryArea=&sortBy=landedCost|moq|freshness`
  * **Logic:** If `requirementId` is supplied, runs hard compatibility filters (unit, pack size, delivery coverage, quote expiry) + `matchingService.matchProducts()`, computes `minRetailerQuantity` ($MOQ_R$) and `quantityStepMultiple` ($\text{Step}$), and returns ranked offers with match explanations and mismatch warnings.
* **`POST /api/offers/compare`**
  * **Request:** `{ requirementId, offerIds: [] }`
  * **Logic:** Computes deterministic landed-cost comparison for the requested quantity and calls `advisoryService.summarizeQuotes()` grounded strictly in the calculated numbers.
* **`POST /api/quotes/requests` & `PATCH /api/quotes/:id/respond`** $\rightarrow$ Creates and responds to custom or revised `Quote` records.

### 3.4 Group-Buy Pools, 72-Hour Timer & 24-Hour Under-MOQ Decisions
* **`POST /api/pools`**
  * **Access:** `SHOP_OWNER`, `ADMIN`
  * **Request:** `{ title, requirementId, supplierOfferId, paymentPolicy: 'PAY_AT_JOIN' | 'PAY_AFTER_APPROVAL' }`
  * **Logic:** Verifies requirement is `CONFIRMED` and compatible with `SupplierOffer`. Computes $MOQ_W, MOQ_R, \text{Step}$. Sets `publishedAt = clock.now()` and `deadline = publishedAt + 72 hours`. Creates pool in `RECRUITING`.
* **`POST /api/pools/:id/contributions`**
  * **Access:** `SHOP_OWNER`
  * **Request:** `{ requirementId, quantity, acceptSubstitution? }`
  * **Logic:**
    1. Verifies pool is `RECRUITING` and `clock.now() < pool.deadline`.
    2. Verifies requirement is `CONFIRMED` and belongs to caller's shop.
    3. Enforces no duplicate active contribution for the same shop in the pool.
    4. Validates product/unit/material compatibility (requiring `acceptSubstitution === true` if material differs).
    5. Validates Retailer MOQ and Step Multiple: $Q_i \ge MOQ_R$ and $(Q_i \bmod \text{Step}) = 0$.
    6. Creates `Contribution` (`PENDING_PAYMENT` under `PAY_AT_JOIN`) and returns required payable amount for PayPal Sandbox checkout.
* **`PATCH /api/pools/:id/contributions/:contributionId`**
  * **Access:** Contribution Owner
  * **Request:** `{ quantity }`
  * **Logic:** Permitted only while pool is in `RECRUITING` ($Q_{\text{pool}} < MOQ_W$ and `clock.now() < pool.deadline`). Validates new quantity against $MOQ_R$ and $\text{Step}$. Recalculates pool tiers and shares:
    * If payable amount increases $\rightarrow$ creates a pending delta `Payment` (`QUANTITY_INCREASE_DELTA`) requiring buyer checkout confirmation before activating the extra quantity.
    * If payable amount decreases $\rightarrow$ updates contribution quantity, recalculates pool, and creates a partial `Refund` (`QUANTITY_REDUCTION`).
* **`DELETE /api/pools/:id/contributions/:contributionId`**
  * **Access:** Contribution Owner
  * **Logic:** Permitted only while pool is in `RECRUITING`. Marks contribution `WITHDRAWN`, recalculates remaining pool total and tier, and initiates a full `Refund` (`BUYER_WITHDRAWAL`) of captured payments.
* **`POST /api/pools/:id/approve`**
  * **Access:** Contribution Owner
  * **Request:** `{ priceSnapshotId }`
  * **Logic:** Verifies pool is in `AWAITING_APPROVALS` and `priceSnapshotId === pool.latestPriceSnapshotId`. Marks contribution `APPROVED`. When all active contributions are `APPROVED`:
    * If any buyer owes a balance/delta $\rightarrow$ transitions pool to `AWAITING_PAYMENT`.
    * If all buyers are fully paid (and any tier-drop savings refunds are queued) $\rightarrow$ transitions pool to `FUNDED` and triggers final `Order` creation.
* **`POST /api/pools/:id/decision`**
  * **Access:** Contribution Owner
  * **Request:** `{ decision: 'PROCEED' | 'CANCEL', acceptRevisedQuoteId? }`
  * **Logic:** Permitted when `pool.state === 'UNDER_MOQ_DECISION_PENDING'` and `clock.now() < pool.decisionDeadline`. Records buyer's explicit decision and timestamp. If `CANCEL`, marks contribution `CANCELLED_UNDER_MOQ`, initiates full `Refund` (`UNDER_MOQ_BUYER_CANCEL`), and triggers under-MOQ resolution evaluation.
* **`POST /api/pools/:id/supplier-feasibility`**
  * **Access:** `SUPPLIER`, `ADMIN`
  * **Request:** `{ action: 'ACCEPT_UNDER_MOQ' | 'SUBMIT_REVISED_QUOTE' | 'REJECT', revisedQuoteData? }`
  * **Logic:** Records supplier decision for an under-MOQ pool and triggers resolution across remaining proceeding buyers.

### 3.5 Payments, Webhooks & Refunds
* **`POST /api/payments/create-order`**
  * **Access:** `SHOP_OWNER`
  * **Request:** `{ contributionId, paymentPurpose, idempotencyKey }`
  * **Logic:** Computes authoritative payable amount in minor units on the backend (never trusting client amounts). Calls `paypalAdapter.createOrder()`, saves `Payment` (`CREATED`, `isTestTransaction: true`).
* **`POST /api/payments/:paymentId/capture`**
  * **Access:** `SHOP_OWNER`
  * **Request:** `{ providerOrderId }`
  * **Logic:** Calls `paypalAdapter.captureOrder(providerOrderId)` on the backend. Inside a MongoDB transaction:
    1. Marks `Payment` as `PAID` with `providerCaptureId` and `capturedAt`.
    2. Updates `Contribution` (`state = 'ACTIVE'`, increments `totalPaidMinor`).
    3. Recomputes $Q_{\text{pool}}$ and tier pricing across all active paid contributions.
    4. **Early MOQ Lock Check:** If `pool.state === 'RECRUITING'` and $Q_{\text{pool}} \ge MOQ_W$, immediately locks the pool (`state = 'AWAITING_APPROVALS'`, `lockedAt = now`, `lockReason = 'MOQ_REACHED_EARLY'`), freezes a versioned `PriceSnapshot`, and notifies all participants.
* **`POST /api/payments/webhook`**
  * **Access:** Public (Cryptographically Verified PayPal Webhook)
  * **Logic:** Verifies PayPal webhook signature headers, deduplicates by event/capture ID, and reconciles `Payment` or `Refund` states idempotently.
* **`GET /api/payments` & `GET /api/refunds`** $\rightarrow$ Lists buyer payments and refunds.

### 3.6 Orders, Settlements, Notifications & Administration
* **`GET /api/orders`, `GET /api/orders/:id`, `GET /api/orders/:id/po-summary`** $\rightarrow$ Reads finalized orders, itemized member allocations, separate `SupplierSettlement` records, and downloadable PO summaries.
* **`PATCH /api/orders/:id/supplier-status`** $\rightarrow$ Allows `SUPPLIER` or `ADMIN` to confirm, reject (triggering full refunds), or update delivery status.
* **`GET /api/notifications` & `PATCH /api/notifications/:id/read`** $\rightarrow$ Manages in-app notifications.
* **`POST /api/admin/jobs/run-lifecycle-check`** $\rightarrow$ Executes the 72h pool deadline and 24h decision cutoff evaluator (accepting an optional test clock offset in development/test environments).
* **`GET /api/admin/reconciliation` & `GET /api/admin/audit-logs`** $\rightarrow$ Provides full administrative inspection of exceptions, audit events, and AI execution logs.

---

## 4. Core Backend Algorithms & Deterministic Business Logic

### 4.1 Two-Level MOQ & Step-Multiple Validator (`moqValidator.service.js`)

```javascript
/**
 * Computes authoritative Wholesaler MOQ (MOQ_W), Retailer Minimum MOQ (MOQ_R),
 * and Retailer Step Increment Multiple (Step).
 */
export function getOfferMoqRules(offer) {
  const wholesalerMoq = Number(offer.minimumOrderQuantity); // e.g., 1000
  const retailerMoqPercentage = Number(offer.retailerMoqPercentage ?? 20); // Default 20%
  const retailerStepPercentage = Number(offer.retailerStepPercentage ?? 1); // Default 1%

  const minRetailerQuantity =
    offer.minRetailerQuantityOverride != null
      ? Number(offer.minRetailerQuantityOverride)
      : Math.max(1, Math.ceil((wholesalerMoq * retailerMoqPercentage) / 100));

  const quantityStepMultiple =
    offer.quantityStepMultipleOverride != null
      ? Number(offer.quantityStepMultipleOverride)
      : Math.max(1, Math.floor((wholesalerMoq * retailerStepPercentage) / 100));

  return {
    wholesalerMoq,
    retailerMoqPercentage,
    retailerStepPercentage,
    minRetailerQuantity,   // 200 when MOQ_W = 1000, p_min = 20%
    quantityStepMultiple,  // 10 when MOQ_W = 1000, p_step = 1%
  };
}

export function validateContributionQuantity(quantity, offer) {
  const rules = getOfferMoqRules(offer);

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return {
      isValid: false,
      errorCode: 'INVALID_QUANTITY_TYPE',
      message: 'Quantity must be a positive whole number.',
      rules,
    };
  }

  if (quantity < rules.minRetailerQuantity) {
    return {
      isValid: false,
      errorCode: 'BELOW_RETAILER_MOQ',
      message: `Retailer minimum order quantity is ${rules.minRetailerQuantity} ${offer.packUnit} (${rules.retailerMoqPercentage}% of Wholesaler MOQ ${rules.wholesalerMoq}).`,
      rules,
    };
  }

  if (quantity % rules.quantityStepMultiple !== 0) {
    return {
      isValid: false,
      errorCode: 'INVALID_STEP_MULTIPLE',
      message: `Quantity must be a multiple of ${rules.quantityStepMultiple} ${offer.packUnit} (${rules.retailerStepPercentage}% step of Wholesaler MOQ ${rules.wholesalerMoq}).`,
      rules,
    };
  }

  return { isValid: true, rules };
}
```

---

### 4.2 Deterministic Pricing & Cost Allocation Engine (`pricingEngine.service.js`)

All monetary calculations use **integer minor units** (e.g., $1\text{ INR} = 100\text{ paise}$).

```javascript
/**
 * Deterministically computes pool total quantity, qualified bulk price tier,
 * merchandise total, shipping allocation, minor-unit rounding reconciliation,
 * and per-shop itemized cost breakdown.
 */
export function computeDeterministicPoolPricing({
  offer,
  eligibleContributions,
  shippingCostMinor = null,
  shippingAllocationMethod = 'PER_UNIT',
}) {
  const totalEligibleQuantity = eligibleContributions.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  // Select best applicable price tier where totalEligibleQuantity >= tier.minQuantity
  let appliedUnitPriceMinor = offer.baseUnitPriceMinor;
  let activeTier = { minQuantity: 1, unitPriceMinor: offer.baseUnitPriceMinor };

  const sortedTiers = [...(offer.quantityTiers || [])].sort(
    (a, b) => b.minQuantity - a.minQuantity
  );
  for (const tier of sortedTiers) {
    if (totalEligibleQuantity >= tier.minQuantity) {
      appliedUnitPriceMinor = tier.unitPriceMinor;
      activeTier = tier;
      break;
    }
  }

  const merchandiseTotalMinor = totalEligibleQuantity * appliedUnitPriceMinor;

  let allocatedShippingRunningTotal = 0;
  const memberShares = eligibleContributions.map((contrib) => {
    const merchandiseShareMinor = contrib.quantity * appliedUnitPriceMinor;

    let shippingShareMinor = 0;
    if (shippingCostMinor != null && shippingCostMinor > 0 && totalEligibleQuantity > 0) {
      if (shippingAllocationMethod === 'EQUAL_SHARE') {
        shippingShareMinor = Math.floor(
          shippingCostMinor / eligibleContributions.length
        );
      } else {
        shippingShareMinor = Math.floor(
          (shippingCostMinor * contrib.quantity) / totalEligibleQuantity
        );
      }
      allocatedShippingRunningTotal += shippingShareMinor;
    }

    const baselineMerchandiseMinor = contrib.quantity * offer.baseUnitPriceMinor;
    const verifiedSavingsMinor = Math.max(
      0,
      baselineMerchandiseMinor - merchandiseShareMinor
    );

    return {
      contributionId: contrib._id,
      shopId: contrib.shopId,
      quantity: contrib.quantity,
      unit: offer.packUnit,
      appliedUnitPriceMinor,
      merchandiseShareMinor,
      shippingShareMinor,
      roundingAdjustmentMinor: 0,
      totalPayableMinor: merchandiseShareMinor + shippingShareMinor,
      verifiedSavingsMinor,
    };
  });

  // Reconcile integer-division remainder on shipping so sum of shares === group total
  if (
    shippingCostMinor != null &&
    shippingCostMinor > 0 &&
    memberShares.length > 0
  ) {
    const remainderMinor = shippingCostMinor - allocatedShippingRunningTotal;
    if (remainderMinor !== 0) {
      const lastShare = memberShares[memberShares.length - 1];
      lastShare.shippingShareMinor += remainderMinor;
      lastShare.roundingAdjustmentMinor = remainderMinor;
      lastShare.totalPayableMinor += remainderMinor;
    }
  }

  const groupTotalPayableMinor =
    merchandiseTotalMinor + (shippingCostMinor ?? 0);

  return {
    currency: offer.currency,
    totalEligibleQuantity,
    wholesalerMoq: offer.minimumOrderQuantity,
    moqShortfall: Math.max(0, offer.minimumOrderQuantity - totalEligibleQuantity),
    isMoqReached: totalEligibleQuantity >= offer.minimumOrderQuantity,
    baseUnitPriceMinor: offer.baseUnitPriceMinor,
    appliedUnitPriceMinor,
    activeTier,
    merchandiseTotalMinor,
    shippingCostMinor,
    shippingStatus: shippingCostMinor == null ? 'EXCLUDED_OR_PENDING' : 'KNOWN',
    shippingAllocationMethod,
    groupTotalPayableMinor,
    memberShares,
  };
}
```

#### Mandatory $₹4,800$ Calculation Verification:
* **Offer:** Base price $= ₹100/\text{box}$ ($10000\text{ paise}$); Tier 1 ($30\text{–}49\text{ boxes}$) $= ₹90/\text{box}$ ($9000\text{ paise}$); Tier 2 ($\ge 50\text{ boxes}$) $= ₹80/\text{box}$ ($8000\text{ paise}$). Shipping excluded (`null`).
* **Confirmed Contributions:** Shop A $= 20\text{ boxes}$, Shop B $= 15\text{ boxes}$, Shop C $= 25\text{ boxes}$.
* **Execution:**
  * `totalEligibleQuantity` $= 20 + 15 + 25 = 60\text{ boxes}$.
  * `appliedUnitPriceMinor` $= 8000\text{ paise}$ ($₹80/\text{box}$).
  * `merchandiseTotalMinor` $= 60 \times 8000 = 480000\text{ paise}$ ($₹4,800$).
  * `memberShares`:
    * Shop A ($20\text{ boxes}$): $20 \times 8000 = 160000\text{ paise}$ ($₹1,600$), Savings $= ₹400$.
    * Shop B ($15\text{ boxes}$): $15 \times 8000 = 120000\text{ paise}$ ($₹1,200$), Savings $= ₹300$.
    * Shop C ($25\text{ boxes}$): $25 \times 8000 = 200000\text{ paise}$ ($₹2,000$), Savings $= ₹500$.
  * Sum of shares $= 160000 + 120000 + 200000 = 480000\text{ paise}$ ($₹4,800$).

---

### 4.3 72-Hour Timer & 10-Case Under-MOQ Decision Resolution (`underMoqDecision.service.js`)

1. **Scheduled 72-Hour Expiry Transition:**
   * `poolScheduler.job.js` queries all pools where `state === 'RECRUITING'` and `deadline <= clock.now()`.
   * If $Q_{\text{pool}} < MOQ_W$, the service locks the pool:
     * `state = 'UNDER_MOQ_DECISION_PENDING'`
     * `lockedAt = clock.now()`
     * `lockReason = 'EXPIRED_72H_UNDER_MOQ'`
     * `decisionDeadline = lockedAt + 24 hours`
   * Marks every active contribution's `underMoqDecision = 'PENDING'`.
   * Calls `advisoryService.recommendUnderMOQAction()` and persists the structured AI advisory on the pool.
   * Dispatches `UNDER_MOQ_DECISION_REQUIRED` notifications to all active members.

2. **Deterministic Handling of All 10 Under-MOQ Cases:**
   * **Case 1 (Non-responsive buyers after 24 hours):** When `clock.now() >= pool.decisionDeadline`, any contribution still in `underMoqDecision === 'PENDING'` is set to `EXPIRED_NO_RESPONSE`, transitioned to `CANCELLED_UNDER_MOQ`, excluded from $Q_{\text{pool}}$, and issued a full `Refund` (`UNDER_MOQ_NO_RESPONSE`). Silence is never treated as approval.
   * **Case 2 (All buyers cancel):** Pool transitions to `CANCELLED` (`closureReason = 'ALL_BUYERS_CANCELLED_UNDER_MOQ'`). Full refunds are initiated for all participants.
   * **Case 3 (All buyers proceed):** Backend checks `supplierUnderMoqStatus`:
     * If supplier accepts sub-MOQ at current tier $\rightarrow$ freezes `PriceSnapshot` and moves to `AWAITING_APPROVALS`.
     * If supplier submits a valid revised quote $\rightarrow$ freezes revised `PriceSnapshot` and moves to `AWAITING_REVISED_QUOTE_APPROVAL`.
     * If supplier rejects sub-MOQ $\rightarrow$ cancels pool and refunds all buyers.
   * **Case 4 (Some buyers proceed and others cancel):** Cancelling buyers are immediately refunded (`UNDER_MOQ_BUYER_CANCEL`) and excluded. The backend recalculates $Q_{\text{remaining}}$ and the applicable price tier across the remaining `PROCEED` buyers.
   * **Case 5 (Remaining participants fall below viable quantity requirement):** If $Q_{\text{remaining}} = 0$ or falls below the supplier's minimum sub-MOQ floor, the pool transitions to `CANCELLED` and remaining buyers receive full refunds.
   * **Case 6 (Supplier does not accept an order below MOQ):** Pool transitions to `CANCELLED` (`closureReason = 'SUPPLIER_REJECTED_UNDER_MOQ'`) and all remaining buyers receive full refunds.
   * **Case 7 (Valid revised supplier quotation becomes available):** Backend creates a new `Quote` and versioned `PriceSnapshot`, invalidates previous approvals, and notifies remaining buyers to explicitly approve the revised terms.
   * **Case 8 (Revised pricing or lower tier requires extra payment):** Once remaining buyers approve the revised `PriceSnapshot`, the backend computes `deltaMinor = finalTotalPayableMinor - totalPaidMinor` and creates a `Payment` (`UNDER_MOQ_SURCHARGE`) in `AWAITING_PAYMENT`.
   * **Case 9 (Extra payment fails or expires):** Contribution surcharge payment is marked `FAILED`, pool transitions to `NEEDS_REVIEW` or `CANCELLED`, and previously captured funds are refunded (`EXTRA_PAYMENT_FAILURE_ROLLBACK`).
   * **Case 10 (Pool cancelled at any stage):** All captured buyer payments not yet refunded have `Refund` records automatically generated and tracked to completion.

---

## 5. Comprehensive Testing Matrix

| Test Layer | Runner | Required Test Suites & Scenarios |
| :--- | :--- | :--- |
| **Unit Tests** | Vitest | • **Mandatory $₹4,800$ Calculation Test** ($20+15+25=60\text{ boxes} \rightarrow ₹80/\text{box} \rightarrow ₹4,800$).<br>• **Two-Level MOQ & Step Validator** ($MOQ_W=1000 \implies MOQ_R=200, \text{Step}=10$; rejects $190$, rejects $205$, accepts $200, 210$).<br>• Shipping allocation (`PER_UNIT`, `EQUAL_SHARE`) and paise remainder reconciliation.<br>• Versioned `PriceSnapshot` creation and automatic approval invalidation on price change.<br>• AI Zod schema validation and prompt-injection sanitization. |
| **Integration Tests** | Vitest + Supertest | • Auth, RBAC (`SHOP_OWNER`, `SUPPLIER`, `ADMIN`, `REVIEWER`), and private resource ownership guards.<br>• File upload validation (reject unsupported MIME or $> 10\text{ MB}$ files; verify private download guard).<br>• Pay-at-join PayPal Sandbox order creation, server capture verification, and duplicate webhook idempotency.<br>• Pre-lock quantity increase (delta payment) and decrease/withdrawal (refund creation).<br>• Early MOQ lock vs. 72-hour expiration using injectable `ClockService`.<br>• All 10 Under-MOQ decision edge cases (+72h and +24h simulated clock). |
| **End-to-End (E2E) Tests** | Playwright | • Full 3-Shop Procurement Journey: Landing page $\rightarrow$ Register/Login $\rightarrow$ AI requirement extraction & confirmation $\rightarrow$ Supplier comparison $\rightarrow$ Join pool (enforcing $MOQ_R$ & $\text{Step}$) $\rightarrow$ PayPal Sandbox checkout $\rightarrow$ Reach MOQ $\rightarrow$ Approve `PriceSnapshot` $\rightarrow$ Order confirmation, PO download, separate `SIMULATED` Supplier Settlement badge, and Activity Timeline.<br>• Under-MOQ 72h expiry $\rightarrow$ 24h buyer Proceed/Cancel decision & refund verification. |