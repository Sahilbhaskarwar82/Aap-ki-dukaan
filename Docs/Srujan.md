# Engineering Task Specification — Srujan
**Role:** FinTech, PayPal Sandbox Integration, Multi-State Refunds, Order Fulfilment, Notifications & Audit Backend Engineer  
**Assigned Tasks:** 10 Tasks (`SRU-01` to `SRU-10` out of 50 Total Tasks)

---

## 1. Zero-Collision Ownership & Parallel Work Contract

To ensure your work never collides with **Prakhar**, **Sahil**, **Himanshu**, or **Sujar**, you own the following exclusive directories and files:

* `server/src/middleware/correlationId.middleware.js`
* `server/src/models/Payment.model.js`, `Refund.model.js`, `Order.model.js`, `SupplierSettlement.model.js`, `Notification.model.js`, `AuditLog.model.js`
* `server/src/services/payments/paypalAdapter.service.js`, `payment.service.js`
* `server/src/services/refunds/refund.service.js`
* `server/src/services/orders/order.service.js`
* `server/src/services/notifications/notification.service.js`, `audit.service.js`
* `server/src/controllers/payment.controller.js`, `refund.controller.js`, `order.controller.js`, `notification.controller.js`, `admin.controller.js`
* `server/src/routes/payment.routes.js`, `refund.routes.js`, `order.routes.js`, `notification.routes.js`, `admin.routes.js`
* `server/tests/unit/paymentIdempotency.test.js`, `server/tests/integration/paymentsRefunds.test.js`, `server/tests/integration/ordersAdmin.test.js`

---

## 2. Detailed 10-Task Breakdown for Srujan

### Task `SRU-01`: `Payment` Model & Server-Side PayPal Sandbox Adapter (with Offline `MOCK_DEV` Mode)
* **Exclusive Files:**
  * `server/src/models/Payment.model.js`
  * `server/src/services/payments/paypalAdapter.service.js`
* **Implementation Details:**
  1. Create `Payment` model storing `poolId`, `contributionId`, `shopId`, `payerUserId`, `priceSnapshotId`, `paymentPurpose` (`INITIAL_JOIN`, `QUANTITY_INCREASE_DELTA`, `POST_APPROVAL_FINAL`, `UNDER_MOQ_SURCHARGE`), `provider` (`PAYPAL_SANDBOX`, `MOCK_DEV`), unique `providerOrderId`, sparse unique `providerCaptureId`, unique `idempotencyKey`, `amountMinor`, `currency`, `paymentStatus`, and `isTestTransaction: true`.
  2. Implement `paypalAdapter.service.js` wrapping PayPal Sandbox REST APIs (`/v2/checkout/orders`, `/v2/checkout/orders/:id/capture`, `/v2/payments/captures/:id/refund`) using server-only `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`.
  3. Support `PAYMENT_MODE=mock` for offline automated tests while flagging mock records with `provider: 'MOCK_DEV'` so they are never misrepresented as live PayPal transactions.
* **Verification & Tests:** Unit tests verifying OAuth token caching, order payload formatting in minor units, and mock adapter isolation.

---

### Task `SRU-02`: Authoritative Payment Order Creation & Server-Verified Capture Service
* **Exclusive Files:**
  * `server/src/services/payments/payment.service.js`
  * `server/src/controllers/payment.controller.js`
  * `server/src/routes/payment.routes.js`
* **Implementation Details:**
  1. Implement `POST /api/payments/create-order`: derive `amountMinor` and `currency` strictly on the backend from the contribution or approved `PriceSnapshot` (never trusting client-supplied amounts).
  2. Implement `POST /api/payments/:paymentId/capture`: call PayPal Sandbox to capture the order, verify the provider response status is `COMPLETED`, update `Payment` to `PAID`, update `Contribution.totalPaidMinor` and `state = 'ACTIVE'`, and invoke `poolLifecycleService.recalculatePoolAfterPayment(poolId, session)`.
  3. Enforce rule **FR-PAY-007**: a browser redirect or frontend callback alone never marks a contribution paid.
* **Verification & Tests:** Integration tests verifying pay-at-join capture, delta payment capture, and handling of cancelled/failed PayPal checkouts.

---

### Task `SRU-03`: Cryptographic Webhook Verification, Idempotency Protection & Payment Reconciliation
* **Exclusive Files:**
  * `server/src/services/payments/payment.service.js` (Webhook & reconciliation methods)
  * `server/tests/unit/paymentIdempotency.test.js`
* **Implementation Details:**
  1. Implement `POST /api/payments/webhook` verifying PayPal webhook headers (`PAYPAL-TRANSMISSION-SIG`, `PAYPAL_WEBHOOK_ID`).
  2. Enforce strict idempotency using `idempotencyKey`, `providerOrderId`, and `providerCaptureId` so duplicate API clicks or repeated webhook deliveries never double-credit a contribution or trigger duplicate order transitions.
  3. Implement `reconcilePaymentState(paymentId)` to query the provider when a payment is in `UNKNOWN` or `CAPTURE_PENDING` due to a network timeout.
* **Verification & Tests:** Unit and integration tests sending $5$ identical concurrent capture requests and duplicate webhooks, asserting exactly $1$ payment capture is recorded.

---

### Task `SRU-04`: `Refund` Model & Multi-State Refund Engine (Withdrawals, Tier-Drop Savings & Cancellations)
* **Exclusive Files:**
  * `server/src/models/Refund.model.js`
  * `server/src/services/refunds/refund.service.js`
  * `server/src/controllers/refund.controller.js`
  * `server/src/routes/refund.routes.js`
* **Implementation Details:**
  1. Create `Refund` model tracking `paymentId`, `poolId`, `contributionId`, `shopId`, `amountMinor`, `currency`, `reason` (`BUYER_WITHDRAWAL`, `QUANTITY_REDUCTION`, `TIER_PRICE_DROP_SAVINGS`, `POOL_CANCELLED`, `UNDER_MOQ_BUYER_CANCEL`, `UNDER_MOQ_NO_RESPONSE`, `SUPPLIER_REJECTED`, `EXTRA_PAYMENT_FAILURE_ROLLBACK`), `providerRefundId`, `idempotencyKey`, and `status` (`REQUESTED`, `PROCESSING`, `COMPLETED`, `FAILED`).
  2. Implement `initiateRefund(...)` which calls PayPal's capture refund API (or mock adapter), transitions the refund state from `REQUESTED` $\rightarrow$ `PROCESSING` $\rightarrow$ `COMPLETED` (or `FAILED`), updates `Contribution.totalRefundedMinor`, and dispatches notifications.
  3. Implement automatic savings-delta refund calculation when a `PAY_AT_JOIN` pool locks at a lower bulk tier price than what early joiners initially paid.
* **Verification & Tests:** Integration tests covering full withdrawal refunds, partial tier-drop savings refunds, and failed refund alerting.

---

### Task `SRU-05`: Final `Order` Model, Order Creation & Fulfilment Status Lifecycle
* **Exclusive Files:**
  * `server/src/models/Order.model.js`
  * `server/src/services/orders/order.service.js`
  * `server/src/controllers/order.controller.js`
  * `server/src/routes/order.routes.js`
* **Implementation Details:**
  1. Create `Order` model storing unique `orderNumber` (`AKD-2026-XXXX`), `poolId`, `supplierId`, `productId`, `supplierOfferId`, `priceSnapshotId`, group totals (`merchandiseTotalMinor`, `shippingTotalMinor`, `grandTotalMinor`), `memberOrders` (per-shop allocations), `supplierConfirmationStatus` (`PENDING`, `CONFIRMED`, `REJECTED`), `supplierReference`, `isSimulatedConfirmation`, and `orderState`.
  2. Implement `createFinalOrderFromFundedPool(poolId, session)` verifying that all active contributions are `APPROVED` and `PAID`.
  3. Implement `PATCH /api/orders/:id/supplier-status` allowing the wholesaler or admin to confirm the order, update shipping/delivery status, or reject the order (automatically triggering full refunds for all participants).
* **Verification & Tests:** Integration tests verifying order creation from a funded pool and automatic refund rollback if a supplier rejects the order.

---

### Task `SRU-06`: Downloadable Purchase Order (PO) Document Generator (`GET /api/orders/:id/po-summary`)
* **Exclusive Files:**
  * `server/src/services/orders/order.service.js` (PO summary generator)
* **Implementation Details:**
  1. Implement `generatePurchaseOrderSummary(orderId, requestingUser)` returning a structured, printable HTML/JSON Purchase Order document containing the order number, wholesaler details, product specifications, approved `PriceSnapshot` version, itemized per-shop allocations, tax/shipping notes, payment verification references, and provenance/sandbox disclaimers.
  2. Wire `GET /api/orders/:id/po-summary` with participant/supplier/admin authorization.
* **Verification & Tests:** Integration test verifying authorized participants can download the PO summary while non-participants receive `403 Forbidden`.

---

### Task `SRU-07`: Separate `SupplierSettlement` Model & Settlement Lifecycle Service
* **Exclusive Files:**
  * `server/src/models/SupplierSettlement.model.js`
  * `server/src/services/orders/order.service.js` (Settlement methods)
* **Implementation Details:**
  1. Enforce rule **BR-009 & FR-PAY-016**: track wholesaler payout in `SupplierSettlement` completely separately from buyer `Payment` captures.
  2. Support `settlementStatus` (`NOT_STARTED`, `SIMULATED`, `PENDING`, `CONFIRMED`, `FAILED`, `NEEDS_REVIEW`) and `mode` (`DEMO`, `MANUAL`, `INTEGRATED`).
  3. Default prototype settlements to `settlementStatus: 'SIMULATED'` and `mode: 'DEMO'` with explicit disclosure notes unless a verified payout integration is configured.
* **Verification & Tests:** Integration test confirming that capturing buyer payments never falsely marks `SupplierSettlement` as a live bank transfer.

---

### Task `SRU-08`: Persistent In-App `Notification` Center & Optional Email Dispatcher
* **Exclusive Files:**
  * `server/src/models/Notification.model.js`
  * `server/src/services/notifications/notification.service.js`
  * `server/src/controllers/notification.controller.js`
  * `server/src/routes/notification.routes.js`
* **Implementation Details:**
  1. Create `Notification` model supporting all 19 lifecycle event types (pool joined, payment verified/failed, MOQ milestone, early lock, 72h expiry, 24h decision required, quote revised, snapshot approval required/invalidated, refund initiated/completed/failed, order confirmed/rejected/updated).
  2. Expose `GET /api/notifications`, `PATCH /api/notifications/:id/read`, and `PATCH /api/notifications/read-all`.
  3. Wrap notification creation in a non-throwing `try/catch` boundary (**FR-NOTIF-004**) so notification or email failures never alter or roll back order/payment states.
* **Verification & Tests:** Unit and integration tests verifying notification creation and fault isolation.

---

### Task `SRU-09`: Correlation ID Middleware & Immutable `AuditLog` Service
* **Exclusive Files:**
  * `server/src/middleware/correlationId.middleware.js`
  * `server/src/models/AuditLog.model.js`
  * `server/src/services/notifications/audit.service.js`
* **Implementation Details:**
  1. Attach a UUID `X-Correlation-Id` to every incoming request and response.
  2. Implement `auditService.logEvent({ correlationId, actorId, actorRole, action, resourceType, resourceId, poolId, orderId, metadata })` scrubbing any sensitive tokens or passwords.
  3. Expose `GET /api/orders/:id/activity` and pool activity queries returning chronological audit trails.
* **Verification & Tests:** Integration test verifying that every state transition writes an immutable `AuditLog` record.

---

### Task `SRU-10`: Administrator Workspace, Catalogue Moderation & Payment Reconciliation APIs
* **Exclusive Files:**
  * `server/src/controllers/admin.controller.js`
  * `server/src/routes/admin.routes.js`
  * `server/tests/integration/ordersAdmin.test.js`
* **Implementation Details:**
  1. Implement `POST /api/admin/suppliers`, `PATCH /api/admin/suppliers/:id`, `POST /api/admin/offers`, `PATCH /api/admin/offers/:id` for supplier/offer moderation and provenance verification.
  2. Implement `GET /api/admin/reconciliation` surfacing stalled pools, expired quotes, payments in `UNKNOWN`/`NEEDS_REVIEW`, failed refunds, and failed AI extractions.
  3. Implement `POST /api/admin/reconciliation/:paymentId/annotate` enforcing **FR-ADMIN-005** (admins can add reconciliation notes and trigger provider syncs, but can never overwrite or delete captured payment facts).
  4. Implement `GET /api/admin/audit-logs` and `POST /api/admin/jobs/run-lifecycle-check`.
* **Verification & Tests:** Integration tests verifying admin RBAC enforcement, reconciliation queries, and immutability of captured payment facts.