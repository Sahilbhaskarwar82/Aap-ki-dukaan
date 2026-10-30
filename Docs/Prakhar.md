# Engineering Task Specification — Prakhar
**Role:** Lead Backend Architect — Core Infrastructure, Auth/RBAC, Two-Level MOQ & Step Engine, Deterministic Pricing, and 72h/24h Group-Buy Pool Lifecycle  
**Assigned Tasks:** 10 Tasks (`PRK-01` to `PRK-10` out of 50 Total Tasks)

---

## 1. Zero-Collision Ownership & Parallel Work Contract

To ensure your work never collides with **Sahil**, **Srujan**, **Himanshu**, or **Sujar**, you own the following exclusive directories and files:

* `server/src/app.js` & `server/src/server.js`
* `server/src/config/env.js` & `server/src/config/db.js`
* `server/src/services/clock/clock.service.js`
* `server/src/middleware/auth.middleware.js`, `rateLimiter.middleware.js`, `error.middleware.js`
* `server/src/models/User.model.js`, `Shop.model.js`, `GroupBuyPool.model.js`, `Contribution.model.js`, `PriceSnapshot.model.js`
* `server/src/services/pricing/moqValidator.service.js`, `pricingEngine.service.js`, `snapshot.service.js`
* `server/src/services/groupBuy/poolLifecycle.service.js`, `underMoqDecision.service.js`
* `server/src/jobs/poolScheduler.job.js`
* `server/src/controllers/auth.controller.js`, `shop.controller.js`, `pool.controller.js`
* `server/src/routes/auth.routes.js`, `shop.routes.js`, `pool.routes.js`
* `server/tests/unit/pricing.test.js`, `server/tests/unit/moqValidator.test.js`, `server/tests/integration/poolLifecycle.test.js`

### How You Work Independently Without Waiting on Others:
* When your `poolLifecycle.service.js` or `underMoqDecision.service.js` needs to trigger a refund, payment, notification, or AI under-MOQ advisory, call a clean service interface (e.g., `refundService.requestRefund(...)`, `advisoryService.recommendUnderMOQAction(...)`) with a default dependency-injected stub so all your unit and integration tests run standalone.

---

## 2. Detailed 10-Task Breakdown for Prakhar

### Task `PRK-01`: Express Application Bootstrap, Zod Environment Validator, MongoDB Transaction Helper & Health API
* **Exclusive Files:**
  * `server/src/config/env.js`
  * `server/src/config/db.js`
  * `server/src/middleware/error.middleware.js`
  * `server/src/middleware/rateLimiter.middleware.js`
  * `server/src/app.js`
  * `server/src/server.js`
  * `.env.example`
* **Implementation Details:**
  1. Validate all environment variables at startup (`PORT`, `CLIENT_ORIGIN`, `MONGODB_URI`, `JWT_SECRET`, `POOL_DURATION_HOURS=72`, `UNDER_MOQ_DECISION_HOURS=24`, `DEFAULT_RETAILER_MOQ_PERCENT=20`, `DEFAULT_RETAILER_STEP_PERCENT=1`). Fail fast with descriptive errors if required variables are missing.
  2. Configure Mongoose connection pooling and export a `withTransaction(fn)` utility that wraps multi-document operations in a MongoDB session transaction.
  3. Configure CORS restricted to `CLIENT_ORIGIN`, JSON body parsing, security headers (`helmet`), endpoint rate limiters, centralized safe error formatting (scrubbing stack traces and secrets), and `GET /api/health`.
* **Verification & Tests:** `server/tests/integration/health.test.js` verifying `GET /api/health` returns `200 OK` with database state and server timestamp.

---

### Task `PRK-02`: Injectable Server Clock Service (`ClockService`) for Deterministic 72h & 24h Testing
* **Exclusive Files:**
  * `server/src/services/clock/clock.service.js`
  * `server/tests/unit/clock.test.js`
* **Implementation Details:**
  1. Implement `clockService.now()` which returns `new Date(Date.now() + offsetMs)`.
  2. Expose `clockService.advanceTimeByMs(ms)`, `clockService.setFixedTime(isoString)`, and `clockService.reset()` restricted strictly to `NODE_ENV === 'test' || NODE_ENV === 'development'`.
  3. Ensure all pool deadlines (`publishedAt + 72h`) and under-MOQ decision windows (`lockedAt + 24h`) use `clockService.now()` instead of raw `Date.now()` or browser time.
* **Verification & Tests:** Unit test advancing time by $72\text{ hours}$ ($259,200,000\text{ ms}$) and $24\text{ hours}$ ($86,400,000\text{ ms}$) instantaneously.

---

### Task `PRK-03`: User & Shop Mongoose Models, JWT Authentication & RBAC Middleware
* **Exclusive Files:**
  * `server/src/models/User.model.js`
  * `server/src/models/Shop.model.js`
  * `server/src/middleware/auth.middleware.js`
  * `server/src/controllers/auth.controller.js`
  * `server/src/routes/auth.routes.js`
  * `server/tests/integration/auth.test.js`
* **Implementation Details:**
  1. Create `User` model (`name`, normalized unique `email`, `passwordHash`, `role` in `['SHOP_OWNER', 'SUPPLIER', 'ADMIN', 'REVIEWER']`, `status`, `lastLoginAt`) and `Shop` model (`ownerUserId`, `name`, `businessType`, `deliveryArea`, `deliveryAddress`, `contactDetails`, `preferredCurrency`).
  2. Implement `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, and `GET /api/me` using `bcrypt` (cost factor $12$) and signed JWTs.
  3. Build `authenticateJWT`, `requireRoles(...allowedRoles)`, and `verifyResourceOwnership(getResourceOwnerId)` middleware.
* **Verification & Tests:** Integration tests covering registration, duplicate email rejection, login, token invalidation on logout, and `403 Forbidden` when a `SHOP_OWNER` attempts an `ADMIN` route.

---

### Task `PRK-04`: Shop Business Profile Management & Private Ownership Guards
* **Exclusive Files:**
  * `server/src/controllers/shop.controller.js`
  * `server/src/routes/shop.routes.js`
  * `server/tests/integration/shopProfile.test.js`
* **Implementation Details:**
  1. Implement `GET /api/shops/me` and `PATCH /api/shops/me` allowing authenticated shop owners to update permitted fields (`name`, `businessType`, `deliveryArea`, `deliveryAddress`, `contactDetails`, `preferredCurrency`).
  2. Enforce strict ownership so Shop A can never read or mutate Shop B's private profile or purchasing records.
* **Verification & Tests:** Integration test confirming profile updates persist and cross-shop access is blocked with `403 Forbidden`.

---

### Task `PRK-05`: Two-Level MOQ & Step-Multiple Validation Engine ($MOQ_W$, $20\%$ Retailer MOQ, $1\%$ Step)
* **Exclusive Files:**
  * `server/src/services/pricing/moqValidator.service.js`
  * `server/tests/unit/moqValidator.test.js`
* **Implementation Details:**
  1. Implement `getOfferMoqRules(offer)` and `validateContributionQuantity(quantity, offer)`.
  2. Given Wholesaler MOQ $MOQ_W$, Retailer MOQ percentage $p_{\min}$ (default $20\%$), and Step percentage $p_{\text{step}}$ (default $1\%$):
     $$MOQ_R = \max\left(1, \left\lceil MOQ_W \times \frac{p_{\min}}{100} \right\rceil\right)$$
     $$\text{Step} = \max\left(1, \left\lfloor MOQ_W \times \frac{p_{\text{step}}}{100} \right\rfloor\right)$$
  3. Respect explicit overrides (`minRetailerQuantityOverride`, `quantityStepMultipleOverride`) when set on box-level offers.
  4. Reject any quantity $Q_i$ where $Q_i < MOQ_R$ (`BELOW_RETAILER_MOQ`) or $(Q_i \bmod \text{Step}) \ne 0$ (`INVALID_STEP_MULTIPLE`) with clear mathematical error messages.
* **Verification & Tests:** Mandatory unit test with $MOQ_W = 1000, p_{\min} = 20\%, p_{\text{step}} = 1\%$ verifying $MOQ_R = 200$, $\text{Step} = 10$, rejecting $190$ and $205$, and accepting $200, 210, 590$.

---

### Task `PRK-06`: Deterministic Pricing, Bulk Tier Selection & Shipping Allocation Engine
* **Exclusive Files:**
  * `server/src/services/pricing/pricingEngine.service.js`
  * `server/tests/unit/pricing.test.js`
* **Implementation Details:**
  1. Perform all calculations in integer minor units (paise/cents).
  2. Aggregate eligible confirmed/paid contribution quantities $Q_{\text{pool}} = \sum Q_i$.
  3. Select the highest-threshold price tier satisfied by $Q_{\text{pool}}$.
  4. Allocate shipping (`PER_UNIT`, `PER_WEIGHT`, or `EQUAL_SHARE`) and reconcile any integer-division remainder on the final participant share so $\sum \text{shares} = \text{groupTotalPayableMinor}$.
  5. Label unknown shipping or tax components explicitly as `EXCLUDED_OR_PENDING` rather than silently treating them as zero.
  6. Compute verified savings against the offer's baseline price and timestamp.
* **Verification & Tests:** Execute and pass the **Mandatory $₹4,800$ Calculation Test** (Base $₹100$, $30\text{–}49 \rightarrow ₹90$, $\ge 50 \rightarrow ₹80$; contributions of $20, 15, 25\text{ boxes} \implies 60\text{ boxes} \implies ₹80/\text{box} \implies ₹4,800$ total; shares of $₹1,600, ₹1,200, ₹2,000$).

---

### Task `PRK-07`: Versioned `PriceSnapshot` Service & Participant Approval Invalidation Engine
* **Exclusive Files:**
  * `server/src/models/PriceSnapshot.model.js`
  * `server/src/services/pricing/snapshot.service.js`
  * `server/tests/unit/snapshot.test.js`
* **Implementation Details:**
  1. Implement `freezePriceSnapshot(poolId, session)` which creates an immutable, version-incremented `PriceSnapshot` containing the exact per-shop breakdown (`memberShares`).
  2. Implement `approvePriceSnapshot({ poolId, contributionId, shopId, snapshotId, userId })` verifying the pool state and recording the approval timestamp and snapshot reference.
  3. Implement `invalidateApprovalsOnMaterialChange(poolId, newSnapshot, session)` which automatically marks previously approved contributions as `INVALIDATED_BY_CHANGE` if unit price, shipping share, or total payable increases after approval.
* **Verification & Tests:** Unit and integration tests proving that a material cost change invalidates prior approvals and prevents checkout until re-approved.

---

### Task `PRK-08`: `GroupBuyPool` & `Contribution` Models + Open Pool Lifecycle (Create, Join, Edit, Withdraw)
* **Exclusive Files:**
  * `server/src/models/GroupBuyPool.model.js`
  * `server/src/models/Contribution.model.js`
  * `server/src/services/groupBuy/poolLifecycle.service.js`
  * `server/src/controllers/pool.controller.js`
  * `server/src/routes/pool.routes.js`
* **Implementation Details:**
  1. Implement `createPool` (setting `publishedAt = clock.now()` and `deadline = publishedAt + 72h`), `listPools`, `getPoolDetail`, `joinPool`, `updateContributionQuantity`, and `withdrawContribution`.
  2. Enforce that a buyer may edit quantity or withdraw **only** while `pool.state === 'RECRUITING'`, $Q_{\text{pool}} < MOQ_W$, and `clock.now() < pool.deadline`.
  3. Enforce unique active contribution per shop per pool (`partialFilterExpression`).
  4. When a valid quantity increase occurs, create a delta payment requirement; when a decrease or withdrawal occurs, recalculate the pool and trigger a refund request.
* **Verification & Tests:** Integration tests for joining, editing quantity up/down, withdrawing before lock, and rejecting edits/withdrawals after lock (`409 Conflict`).

---

### Task `PRK-09`: Early MOQ Lock & 72-Hour Expiration Scheduler Job
* **Exclusive Files:**
  * `server/src/jobs/poolScheduler.job.js`
  * `server/tests/integration/poolTimer.test.js`
* **Implementation Details:**
  1. **Early Lock on Reaching $MOQ_W$:** In `poolLifecycle.service.js`, the instant a verified contribution causes $Q_{\text{pool}} \ge MOQ_W$ before the 72h deadline, atomically transition the pool to `MOQ_REACHED` $\rightarrow$ `AWAITING_APPROVALS`, set `lockedAt = clock.now()`, `lockReason = 'MOQ_REACHED_EARLY'`, freeze the authoritative `PriceSnapshot`, and emit notifications.
  2. **72-Hour Expiry Below $MOQ_W$:** In `poolScheduler.job.js`, find all pools where `state === 'RECRUITING'` and `deadline <= clock.now()` with $Q_{\text{pool}} < MOQ_W$. Atomically lock each pool (`state = 'UNDER_MOQ_DECISION_PENDING'`, `lockedAt = clock.now()`, `lockReason = 'EXPIRED_72H_UNDER_MOQ'`, `decisionDeadline = lockedAt + 24h`), set active contributions' `underMoqDecision = 'PENDING'`, invoke the AI under-MOQ advisor, and notify all active members.
* **Verification & Tests:** Integration tests using `clockService` to test both immediate lock at $Q_{\text{pool}} \ge MOQ_W$ and scheduled lock at $+72\text{ hours}$ when $Q_{\text{pool}} < MOQ_W$.

---

### Task `PRK-10`: 24-Hour Under-MOQ Decision Engine (All 10 Edge Cases) & Concurrency Safety
* **Exclusive Files:**
  * `server/src/services/groupBuy/underMoqDecision.service.js`
  * `server/tests/integration/underMoqCases.test.js`
* **Implementation Details:**
  1. Implement `submitBuyerUnderMoqDecision({ poolId, contributionId, decision: 'PROCEED' | 'CANCEL' })`, `processExpiredDecisionWindow(poolId)`, and `processSupplierUnderMoqFeasibility({ poolId, action, revisedQuoteData })`.
  2. Implement and test all **10 mandatory under-MOQ scenarios**:
     * Case 1: All buyers `PROCEED`.
     * Case 2: All buyers `CANCEL` (pool cancelled, full refunds).
     * Case 3: Mixed responses—some `PROCEED`, others `CANCEL` (cancelling buyers refunded, remaining pool recalculated).
     * Case 4: Non-responsive buyers after 24h (silence is never consent $\rightarrow$ marked `EXPIRED_NO_RESPONSE`, excluded, and refunded).
     * Case 5: Supplier rejects order below $MOQ_W$ (pool cancelled, all remaining buyers refunded).
     * Case 6: Valid revised supplier quotation provided (new `PriceSnapshot` frozen, requires explicit buyer approval).
     * Case 7: Revised pricing or lower tier requires extra payment (`UNDER_MOQ_SURCHARGE` delta payment created).
     * Case 8: Extra payment fails (pool transitions to `NEEDS_REVIEW` / `CANCELLED`, prior captures refunded).
     * Case 9: Remaining participants no longer meet viable quantity/pricing floor (pool cancelled, remaining buyers refunded).
     * Case 10: Pool cancellation at any stage initiates full refunds and writes audit logs.
* **Verification & Tests:** Dedicated integration test suite (`underMoqCases.test.js`) executing all 10 cases plus concurrent race-condition tests (`Promise.all` simultaneous joins/withdrawals).