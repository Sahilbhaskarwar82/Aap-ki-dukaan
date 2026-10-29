/**
 * Payment Service — SRU-02
 *
 * Authoritative server-side payment orchestration.  All amounts are derived
 * from the database — never from the client request body.
 *
 * Responsibilities:
 *  1. createPaymentOrder()    — POST /api/payments/create-order
 *  2. capturePaymentOrder()   — POST /api/payments/:paymentId/capture
 *  3. listPaymentsForShop()   — GET  /api/payments
 *
 * FR-PAY-001: PayPal orders created server-side with backend-computed amounts.
 * FR-PAY-002: Captures verified server-side; browser redirect alone never
 *             marks a contribution paid (FR-PAY-007 / SRU-02 rule 3).
 * FR-PAY-003: Idempotency enforced via unique idempotencyKey on Payment doc.
 */

import mongoose from "mongoose";
import { Payment } from "../models/Payment.model.js";
import { ApiError } from "../utils/apiError.js";
import { getPayPalAdapter } from "./payments/paypalAdapter.service.js";

// ── Lazy model imports (Prakhar / Suraj's models; loaded at call-time so
//    parallel devs can add them without circular-import issues) ───────────────
function getContribution() {
  return mongoose.model("Contribution");
}
function getPriceSnapshot() {
  return mongoose.model("PriceSnapshot");
}
function getGroupBuyPool() {
  return mongoose.model("GroupBuyPool");
}

// ── Soft import of poolLifecycleService (Prakhar/Suraj's service) ─────────────
/**
 * Calls poolLifecycleService.recalculatePoolAfterPayment() if the module
 * is available.  During parallel development, if the service hasn't been
 * wired yet, this is a safe no-op that logs a warning instead of crashing.
 *
 * Once Prakhar/Suraj publish the module the import will resolve normally.
 */
async function safeRecalculatePool(poolId, session) {
  try {
    const mod = await import("./groupBuy/poolLifecycle.service.js").catch(
      () => null
    );
    if (mod?.recalculatePoolAfterPayment) {
      await mod.recalculatePoolAfterPayment(poolId, session);
    } else {
      console.warn(
        `[PaymentService] poolLifecycleService not yet available — ` +
          `pool ${poolId} recalculation skipped. Wire up when SRU/Prakhar merges.`
      );
    }
  } catch (err) {
    // Never let pool-recalc failure roll back a verified payment
    console.error(
      `[PaymentService] poolLifecycleService.recalculatePoolAfterPayment failed:`,
      err
    );
  }
}

// ── Amount derivation helpers ─────────────────────────────────────────────────

/**
 * Computes the exact amountMinor the buyer must pay for this payment purpose,
 * strictly from the database.  Never accepts client-supplied amounts.
 *
 * @param {string} paymentPurpose
 * @param {mongoose.Document} contribution
 * @param {mongoose.Document|null} snapshot   Required for POST_APPROVAL_FINAL
 * @returns {{ amountMinor: number, currency: string }}
 */
function derivePayableAmount(paymentPurpose, contribution, snapshot) {
  const alreadyPaid = contribution.totalPaidMinor ?? 0;

  switch (paymentPurpose) {
    case "INITIAL_JOIN": {
      // Full amount due at the time of joining — nothing has been paid yet.
      const amount = contribution.finalTotalPayableMinor;
      if (!amount || amount <= 0) {
        throw new ApiError(
          422,
          "Contribution finalTotalPayableMinor is zero or missing. Cannot create payment."
        );
      }
      return { amountMinor: amount, currency: contribution.currency ?? "INR" };
    }

    case "QUANTITY_INCREASE_DELTA": {
      // Buyer increased their quantity — pay only the difference.
      const delta = contribution.finalTotalPayableMinor - alreadyPaid;
      if (delta <= 0) {
        throw new ApiError(
          422,
          `No outstanding balance for QUANTITY_INCREASE_DELTA ` +
            `(finalTotalPayable=${contribution.finalTotalPayableMinor}, paid=${alreadyPaid}).`
        );
      }
      return { amountMinor: delta, currency: contribution.currency ?? "INR" };
    }

    case "POST_APPROVAL_FINAL": {
      // Snapshot has been approved — pay outstanding balance from the snapshot.
      if (!snapshot) {
        throw new ApiError(
          422,
          "priceSnapshotId is required for POST_APPROVAL_FINAL payments."
        );
      }
      // Find this contribution's share in the snapshot
      const share = snapshot.memberShares?.find(
        (s) => s.contributionId?.toString() === contribution._id.toString()
      );
      if (!share) {
        throw new ApiError(
          404,
          "This contribution is not listed in the supplied PriceSnapshot."
        );
      }
      const delta = share.totalPayableMinor - alreadyPaid;
      if (delta <= 0) {
        throw new ApiError(
          422,
          `No outstanding balance for POST_APPROVAL_FINAL ` +
            `(snapshotShare=${share.totalPayableMinor}, paid=${alreadyPaid}).`
        );
      }
      return { amountMinor: delta, currency: snapshot.currency ?? "INR" };
    }

    case "UNDER_MOQ_SURCHARGE": {
      // Same logic as QUANTITY_INCREASE_DELTA — pay outstanding delta.
      const surcharge = contribution.finalTotalPayableMinor - alreadyPaid;
      if (surcharge <= 0) {
        throw new ApiError(
          422,
          `No outstanding surcharge for UNDER_MOQ_SURCHARGE ` +
            `(finalTotalPayable=${contribution.finalTotalPayableMinor}, paid=${alreadyPaid}).`
        );
      }
      return {
        amountMinor: surcharge,
        currency: contribution.currency ?? "INR",
      };
    }

    default:
      throw new ApiError(400, `Unknown paymentPurpose: ${paymentPurpose}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. createPaymentOrder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a PayPal Sandbox order for a contribution.
 *
 * Amount and currency are derived exclusively from the Contribution /
 * PriceSnapshot documents — the client request body MUST NOT contain amounts.
 *
 * @param {object} params
 * @param {string} params.contributionId   Mongo ObjectId string
 * @param {string} params.paymentPurpose   INITIAL_JOIN | QUANTITY_INCREASE_DELTA | POST_APPROVAL_FINAL | UNDER_MOQ_SURCHARGE
 * @param {string} params.idempotencyKey   Client-generated UUID (unique per payment intent)
 * @param {string} params.payerUserId      Authenticated user's Mongo ObjectId string
 * @param {string} [params.priceSnapshotId]  Required for POST_APPROVAL_FINAL
 * @param {string} [params.returnUrl]      PayPal redirect on approval
 * @param {string} [params.cancelUrl]      PayPal redirect on cancellation
 * @returns {Promise<{ payment: object, approveUrl: string }>}
 */
export async function createPaymentOrder({
  contributionId,
  paymentPurpose,
  idempotencyKey,
  payerUserId,
  priceSnapshotId = null,
  returnUrl = `${process.env.CLIENT_URL ?? "http://localhost:5173"}/payments/success`,
  cancelUrl = `${process.env.CLIENT_URL ?? "http://localhost:5173"}/payments/cancel`,
}) {
  // ── 1. Idempotency guard ─────────────────────────────────────────────────
  const existing = await Payment.findOne({ idempotencyKey });
  if (existing) {
    // Same key → return the already-created payment (safe for retries)
    return { payment: existing, approveUrl: null, isDuplicate: true };
  }

  // ── 2. Load and validate Contribution ───────────────────────────────────
  const Contribution = getContribution();
  const contribution = await Contribution.findById(contributionId);

  if (!contribution) {
    throw new ApiError(404, `Contribution not found: ${contributionId}`);
  }

  // Ownership: the authenticated user must own this contribution
  if (contribution.createdByUserId?.toString() !== payerUserId.toString()) {
    throw new ApiError(
      403,
      "You are not authorised to create a payment for this contribution."
    );
  }

  // Contribution must be in PENDING_PAYMENT state for initial joins;
  // for deltas/surcharges it must be ACTIVE.
  const validStatesForPurpose = {
    INITIAL_JOIN: ["PENDING_PAYMENT"],
    QUANTITY_INCREASE_DELTA: ["ACTIVE"],
    POST_APPROVAL_FINAL: ["ACTIVE"],
    UNDER_MOQ_SURCHARGE: ["ACTIVE"],
  };

  if (!validStatesForPurpose[paymentPurpose]?.includes(contribution.state)) {
    throw new ApiError(
      409,
      `Contribution state '${contribution.state}' is not valid for payment purpose '${paymentPurpose}'.`
    );
  }

  // ── 3. Load PriceSnapshot if required ────────────────────────────────────
  let snapshot = null;
  if (priceSnapshotId) {
    const PriceSnapshot = getPriceSnapshot();
    snapshot = await PriceSnapshot.findById(priceSnapshotId);
    if (!snapshot) {
      throw new ApiError(404, `PriceSnapshot not found: ${priceSnapshotId}`);
    }
    if (snapshot.poolId?.toString() !== contribution.poolId?.toString()) {
      throw new ApiError(
        409,
        "PriceSnapshot does not belong to the same pool as this contribution."
      );
    }
    if (snapshot.isSuperseded) {
      throw new ApiError(
        409,
        "This PriceSnapshot has been superseded. Please approve the latest snapshot."
      );
    }
  }

  // ── 4. Derive payable amount from DB (never from client) ─────────────────
  const { amountMinor, currency } = derivePayableAmount(
    paymentPurpose,
    contribution,
    snapshot
  );

  // ── 5. Create PayPal order via adapter ───────────────────────────────────
  const adapter = getPayPalAdapter();
  const isMock = process.env.PAYMENT_MODE?.toLowerCase() === "mock";
  const provider = isMock ? "MOCK_DEV" : "PAYPAL_SANDBOX";

  const pool = await getGroupBuyPool().findById(contribution.poolId).lean();
  const description =
    pool?.title
      ? `Aap Ki Dukan — ${pool.title} (${paymentPurpose.replace(/_/g, " ")})`
      : `Aap Ki Dukan — Group Buy Payment`;

  let adapterResult;
  try {
    adapterResult = await adapter.createOrder({
      amountMinor,
      currency,
      idempotencyKey,
      description,
      returnUrl,
      cancelUrl,
    });
  } catch (err) {
    throw new ApiError(
      502,
      `Payment provider error while creating order: ${err.message}`
    );
  }

  // ── 6. Persist Payment record ─────────────────────────────────────────────
  const payment = await Payment.create({
    poolId: contribution.poolId,
    contributionId: contribution._id,
    shopId: contribution.shopId,
    payerUserId,
    priceSnapshotId: priceSnapshotId ?? null,
    paymentPurpose,
    provider,
    providerOrderId: adapterResult.providerOrderId,
    idempotencyKey,
    amountMinor,
    currency,
    paymentStatus: "CREATED",
    isTestTransaction: true, // always true for sandbox / mock
  });

  return {
    payment,
    approveUrl: adapterResult.approveUrl,
    isDuplicate: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. capturePaymentOrder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Server-side capture verification.
 *
 * FR-PAY-002 / FR-PAY-007: A browser redirect or frontend callback alone
 * NEVER marks a contribution paid.  This endpoint is the ONLY path that
 * writes paymentStatus='PAID' and contribution.state='ACTIVE'.
 *
 * Inside a MongoDB ACID transaction:
 *   1. Mark Payment PAID with providerCaptureId + capturedAt.
 *   2. Update Contribution.totalPaidMinor and set state='ACTIVE'.
 *   3. Call poolLifecycleService.recalculatePoolAfterPayment() (soft-dep).
 *
 * @param {object} params
 * @param {string} params.paymentId       Mongo ObjectId of the Payment doc
 * @param {string} params.providerOrderId PayPal order ID supplied by browser after approval
 * @param {string} params.captureRequesterId Authenticated user's Mongo ObjectId
 * @returns {Promise<{ payment: object, contribution: object }>}
 */
export async function capturePaymentOrder({
  paymentId,
  providerOrderId,
  captureRequesterId,
}) {
  // ── 1. Load Payment ───────────────────────────────────────────────────────
  const payment = await Payment.findById(paymentId);

  if (!payment) {
    throw new ApiError(404, `Payment not found: ${paymentId}`);
  }

  // Ownership: only the original payer can trigger capture
  if (payment.payerUserId?.toString() !== captureRequesterId.toString()) {
    throw new ApiError(
      403,
      "You are not authorised to capture this payment."
    );
  }

  // ── 2. Idempotency: already captured? ────────────────────────────────────
  if (payment.paymentStatus === "PAID") {
    const Contribution = getContribution();
    const contribution = await Contribution.findById(payment.contributionId);
    return { payment, contribution, isDuplicate: true };
  }

  // ── 3. Guard: must be in capturable state ─────────────────────────────────
  const capturableStatuses = ["CREATED", "CAPTURE_PENDING"];
  if (!capturableStatuses.includes(payment.paymentStatus)) {
    throw new ApiError(
      409,
      `Payment is in status '${payment.paymentStatus}' and cannot be captured. ` +
        `Only CREATED or CAPTURE_PENDING payments can be captured.`
    );
  }

  // ── 4. Guard: providerOrderId must match what was stored ──────────────────
  if (payment.providerOrderId !== providerOrderId) {
    throw new ApiError(
      400,
      "providerOrderId does not match the stored PayPal order ID for this payment."
    );
  }

  // Mark in-flight to prevent concurrent duplicate captures
  await Payment.findByIdAndUpdate(paymentId, {
    paymentStatus: "CAPTURE_PENDING",
  });

  // ── 5. Call PayPal adapter to capture ────────────────────────────────────
  const adapter = getPayPalAdapter();
  let captureResult;

  try {
    captureResult = await adapter.captureOrder(
      providerOrderId,
      `capture-${payment.idempotencyKey}`
    );
  } catch (err) {
    // Capture failed — mark payment FAILED and rethrow
    await Payment.findByIdAndUpdate(paymentId, {
      paymentStatus: "FAILED",
      safeErrorCode: "CAPTURE_API_ERROR",
    });
    throw new ApiError(
      502,
      `PayPal capture failed: ${err.message}`
    );
  }

  // ── 6. Verify capture status is COMPLETED ────────────────────────────────
  if (captureResult.captureStatus !== "COMPLETED") {
    await Payment.findByIdAndUpdate(paymentId, {
      paymentStatus: "FAILED",
      safeErrorCode: `CAPTURE_STATUS_${captureResult.captureStatus}`,
    });
    throw new ApiError(
      502,
      `PayPal returned capture status '${captureResult.captureStatus}', expected 'COMPLETED'.`
    );
  }

  // ── 7. Atomic update: Payment + Contribution ──────────────────────────────
  //
  // On a production MongoDB Atlas Replica Set, we run both writes inside a
  // multi-document ACID transaction so a crash between the two writes cannot
  // leave the DB in a half-updated state.
  //
  // On a standalone MongoDB instance (mongodb-memory-server in CI / local
  // dev without replica-set mode), transactions are not supported. We detect
  // this at runtime and fall back to sequential writes protected by the
  // CAPTURE_PENDING status lock set in step 4 above.  The Payment model's
  // optimisticConcurrency flag provides an additional guard.

  let updatedPayment;
  let updatedContribution;

  const isReplicaSet =
    mongoose.connection.client?.topology?.description?.type !== "Single";

  if (isReplicaSet) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        updatedPayment = await Payment.findByIdAndUpdate(
          paymentId,
          {
            paymentStatus: "PAID",
            providerCaptureId: captureResult.providerCaptureId,
            capturedAt: new Date(),
            providerResponseSnapshot: {
              captureId: captureResult.providerCaptureId,
              captureStatus: captureResult.captureStatus,
              currency: captureResult.currency ?? payment.currency,
            },
          },
          { returnDocument: "after", session }
        );

        const Contribution = getContribution();
        updatedContribution = await Contribution.findByIdAndUpdate(
          payment.contributionId,
          { $inc: { totalPaidMinor: payment.amountMinor }, state: "ACTIVE" },
          { returnDocument: "after", session }
        );

        if (!updatedContribution) {
          throw new ApiError(
            404,
            `Contribution ${payment.contributionId} not found during capture transaction.`
          );
        }

        await safeRecalculatePool(payment.poolId, session);
      });
    } finally {
      await session.endSession();
    }
  } else {
    // Standalone fallback (dev / test): sequential writes, CAPTURE_PENDING lock holds
    updatedPayment = await Payment.findByIdAndUpdate(
      paymentId,
      {
        paymentStatus: "PAID",
        providerCaptureId: captureResult.providerCaptureId,
        capturedAt: new Date(),
        providerResponseSnapshot: {
          captureId: captureResult.providerCaptureId,
          captureStatus: captureResult.captureStatus,
          currency: captureResult.currency ?? payment.currency,
        },
      },
      { returnDocument: "after" }
    );

    const Contribution = getContribution();
    updatedContribution = await Contribution.findByIdAndUpdate(
      payment.contributionId,
      { $inc: { totalPaidMinor: payment.amountMinor }, state: "ACTIVE" },
      { returnDocument: "after" }
    );

    if (!updatedContribution) {
      await Payment.findByIdAndUpdate(paymentId, {
        paymentStatus: "NEEDS_REVIEW",
        safeErrorCode: "CONTRIBUTION_NOT_FOUND_POST_CAPTURE",
      });
      throw new ApiError(
        500,
        `Contribution ${payment.contributionId} not found after payment capture. ` +
          `Payment flagged for reconciliation.`
      );
    }

    await safeRecalculatePool(payment.poolId, null);
  }

  return { payment: updatedPayment, contribution: updatedContribution, isDuplicate: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. handleCancelledOrFailedCheckout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called when a buyer cancels the PayPal checkout or the provider signals
 * failure.  Marks the Payment CANCELLED/FAILED without touching the
 * Contribution's paid total or state (contribution stays PENDING_PAYMENT).
 *
 * @param {string} paymentId
 * @param {'CANCELLED'|'FAILED'} reason
 */
export async function handleCancelledOrFailedCheckout(paymentId, reason) {
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    throw new ApiError(404, `Payment not found: ${paymentId}`);
  }

  // If already in a terminal state, ignore (idempotent)
  const terminalStatuses = ["PAID", "CANCELLED", "FAILED", "REFUNDED"];
  if (terminalStatuses.includes(payment.paymentStatus)) {
    return payment;
  }

  const newStatus = reason === "CANCELLED" ? "CANCELLED" : "FAILED";
  const updated = await Payment.findByIdAndUpdate(
    paymentId,
    { paymentStatus: newStatus },
    { new: true }
  );
  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. listPaymentsForShop
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns paginated payment records for the requesting shop.
 * Enforces ownership — a shop can only see its own payments.
 *
 * @param {string} shopId
 * @param {object} options
 * @param {number} options.page    1-indexed page number
 * @param {number} options.limit   Records per page (max 50)
 * @returns {Promise<{ payments: object[], total: number }>}
 */
export async function listPaymentsForShop(shopId, { page = 1, limit = 20 } = {}) {
  const safePage = Math.max(1, parseInt(page, 10));
  const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10)));
  const skip = (safePage - 1) * safeLimit;

  const [payments, total] = await Promise.all([
    Payment.find({ shopId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .select("-providerResponseSnapshot") // never expose raw provider bodies
      .lean(),
    Payment.countDocuments({ shopId }),
  ]);

  return { payments, total, page: safePage, limit: safeLimit };
}
