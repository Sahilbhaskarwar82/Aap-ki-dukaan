import mongoose from "mongoose";

/**
 * Payment Model — SRU-01
 *
 * Tracks every PayPal Sandbox (or MOCK_DEV) payment attempt tied to a
 * pool contribution.  All monetary amounts are stored in MINOR UNITS
 * (paise for INR, cents for USD) — never floating-point.
 *
 * Key design constraints (FR-PAY-001 … FR-PAY-004, BR-015):
 *  - amountMinor is always computed server-side; never trust client values.
 *  - providerOrderId and idempotencyKey are unique so duplicate API calls or
 *    browser re-submits never create phantom payment records.
 *  - providerCaptureId is sparse-unique: only set once the capture succeeds,
 *    prevents double-capture on retry.
 *  - isTestTransaction is always true for sandbox / mock payments so the UI
 *    can render the mandatory "TEST TRANSACTION — PAYPAL SANDBOX" banner.
 */

const paymentSchema = new mongoose.Schema(
  {
    // ── References ────────────────────────────────────────────────────────────
    poolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GroupBuyPool",
      required: true,
      index: true,
    },
    contributionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contribution",
      required: true,
      index: true,
    },
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
      index: true,
    },
    payerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /**
     * Snapshot that was being paid for (null for INITIAL_JOIN before snapshot
     * is frozen; populated for POST_APPROVAL_FINAL / UNDER_MOQ_SURCHARGE).
     */
    priceSnapshotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PriceSnapshot",
      default: null,
    },

    // ── Purpose & Provider ────────────────────────────────────────────────────
    /**
     * Why this payment was created:
     *  INITIAL_JOIN            — buyer joining a pool under PAY_AT_JOIN policy
     *  QUANTITY_INCREASE_DELTA — buyer increased their quantity after joining
     *  POST_APPROVAL_FINAL     — buyer paying outstanding balance after snapshot approval
     *  UNDER_MOQ_SURCHARGE     — surcharge after under-MOQ revised quote was accepted
     */
    paymentPurpose: {
      type: String,
      enum: [
        "INITIAL_JOIN",
        "QUANTITY_INCREASE_DELTA",
        "POST_APPROVAL_FINAL",
        "UNDER_MOQ_SURCHARGE",
      ],
      required: true,
    },

    /**
     * PAYPAL_SANDBOX — real (sandbox) PayPal REST API call
     * MOCK_DEV       — offline adapter used during automated tests
     */
    provider: {
      type: String,
      enum: ["PAYPAL_SANDBOX", "MOCK_DEV"],
      required: true,
      default: "PAYPAL_SANDBOX",
    },

    // ── Provider IDs & Idempotency ─────────────────────────────────────────────
    /**
     * PayPal order ID returned by POST /v2/checkout/orders.
     * Unique so every new checkout attempt has a distinct record.
     */
    providerOrderId: {
      type: String,
      unique: true,
      sparse: true, // null while payment is MOCK_DEV without a real order ID
      default: null,
      index: true,
    },

    /**
     * PayPal capture ID returned by POST /v2/checkout/orders/:id/capture.
     * Sparse-unique: only set once — prevents double-capture on retries.
     */
    providerCaptureId: {
      type: String,
      unique: true,
      sparse: true,
      default: null,
      index: true,
    },

    /**
     * Client-generated idempotency key included in every create-order request.
     * Unique constraint prevents duplicate payment records for the same intent.
     */
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // ── Monetary Values (integer minor units ONLY) ────────────────────────────
    /**
     * Amount in minor currency units (e.g. 480000 = ₹4,800.00 in paise).
     * Always set by backend calculation, never from client payload.
     */
    amountMinor: {
      type: Number,
      required: true,
      min: 1,
    },

    currency: {
      type: String,
      required: true,
      enum: ["INR", "USD"],
      default: "INR",
    },

    // ── Payment State Machine ─────────────────────────────────────────────────
    /**
     * CREATED          — PayPal order created, buyer has not approved yet
     * CAPTURE_PENDING  — buyer approved PayPal checkout, capture in flight
     * PAID             — capture verified server-side (providerCaptureId set)
     * FAILED           — capture failed or payment rejected
     * CANCELLED        — buyer cancelled the PayPal checkout
     * REFUNDED         — fully refunded (see Refund collection for details)
     * PARTIALLY_REFUNDED — partially refunded (tier-drop savings or quantity reduction)
     * UNKNOWN          — network timeout; needs reconciliation
     */
    paymentStatus: {
      type: String,
      enum: [
        "CREATED",
        "CAPTURE_PENDING",
        "PAID",
        "FAILED",
        "CANCELLED",
        "REFUNDED",
        "PARTIALLY_REFUNDED",
        "UNKNOWN",
      ],
      required: true,
      default: "CREATED",
      index: true,
    },

    /**
     * Always true for PayPal Sandbox and MOCK_DEV payments.
     * Drives the mandatory "TEST TRANSACTION — PAYPAL SANDBOX" UI banner
     * or "SIMULATED DEV PAYMENT" badge in mock mode.
     * Must NEVER be set to false in the prototype.
     */
    isTestTransaction: {
      type: Boolean,
      required: true,
      default: true,
    },

    // ── Audit Timestamps ──────────────────────────────────────────────────────
    /** Set when paymentStatus transitions to PAID. */
    capturedAt: {
      type: Date,
      default: null,
    },

    /** Raw provider response body (sanitised — no secrets). */
    providerResponseSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      select: false, // never returned in default queries
    },

    /**
     * Reconciliation notes written by an admin via
     * POST /api/admin/reconciliation/:paymentId/annotate.
     * Admins cannot delete or overwrite captured payment facts (FR-ADMIN-004).
     */
    reconciliationNotes: [
      {
        note: { type: String, required: true, trim: true },
        addedByUserId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        addedAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true, // adds createdAt, updatedAt
    optimisticConcurrency: true, // prevents race conditions on concurrent capture
  }
);

// ── Compound indexes ──────────────────────────────────────────────────────────
paymentSchema.index({ contributionId: 1, paymentStatus: 1 });
paymentSchema.index({ shopId: 1, createdAt: -1 });
paymentSchema.index({ poolId: 1, paymentStatus: 1 });

export const Payment = mongoose.model("Payment", paymentSchema);
