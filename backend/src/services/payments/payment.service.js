/**
 * Payment Service — SRU-02 & SRU-03
 *
 * Authoritative server-side payment orchestration, cryptographic webhook
 * verification, strict concurrency/idempotency protection, and automated
 * reconciliation.
 *
 * Responsibilities:
 *  1. createPaymentOrder()        — POST /api/payments/create-order
 *  2. capturePaymentOrder()       — POST /api/payments/:paymentId/capture (5x concurrency safe)
 *  3. handleCancelledOrFailedCheckout() — POST /api/payments/:paymentId/cancel
 *  4. listPaymentsForShop()       — GET  /api/payments
 *  5. verifyWebhookSignature()    — Header & HMAC/API cryptographic verification
 *  6. handlePayPalWebhook()       — POST /api/payments/webhook
 *  7. reconcilePaymentState()     — POST /api/payments/:paymentId/reconcile
 *
 * Design constraints:
 *  - FR-PAY-001: All amounts derived from database, never from client body.
 *  - FR-PAY-002: Server-side capture verification only.
 *  - FR-PAY-003: Idempotency enforced via idempotencyKey, providerOrderId, and providerCaptureId.
 *  - FR-PAY-007: Only capturePaymentOrder, webhook, or reconciliation can write PAID.
 *  - FR-PAY-010 / SRU-03: Duplicate API clicks or repeated webhook deliveries NEVER double-credit contributions.
 */

import mongoose from "mongoose";
import { Payment } from "../../models/Payment.model.js";
import { ApiError } from "../../utils/apiError.js";
import { getPayPalAdapter } from "./paypalAdapter.service.js";

// ── Lazy model getters ────────────────────────────────────────────────────────
function getContribution() {
  return mongoose.model("Contribution");
}
function getPriceSnapshot() {
  return mongoose.model("PriceSnapshot");
}
function getGroupBuyPool() {
  return mongoose.model("GroupBuyPool");
}

// ── Soft imports for Audit, Notification, and PoolRecalc ──────────────────────
async function safeLogAudit(event) {
  try {
    const mod = await import("../notifications/audit.service.js").catch(() => null);
    if (mod?.logEvent) {
      await mod.logEvent(event);
    }
  } catch (_ignored) {
    // Audit log failure must never roll back payment transactions
  }
}

async function safeSendNotification(params) {
  try {
    const mod = await import("../notifications/notification.service.js").catch(() => null);
    if (mod?.createNotification) {
      await mod.createNotification(params);
    }
  } catch (_ignored) {
    // FR-NOTIF-004: Notification failure must never roll back payments
  }
}

async function safeRecalculatePool(poolId, session = null) {
  try {
    const mod = await import("../groupBuy/poolLifecycle.service.js").catch(() => null);
    const recalcFn = mod?.recalculatePoolAfterPayment || mod?.recalculatePool;
    if (recalcFn) {
      await recalcFn(poolId, session);
    }
  } catch (err) {
    console.error(`[PaymentService] poolLifecycleService recalculation failed:`, err);
  }
}

// ── Amount derivation helper ──────────────────────────────────────────────────
function derivePayableAmount(paymentPurpose, contribution, snapshot) {
  const alreadyPaid = contribution.totalPaidMinor ?? 0;

  switch (paymentPurpose) {
    case "INITIAL_JOIN": {
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
      const delta = contribution.finalTotalPayableMinor - alreadyPaid;
      if (delta <= 0) {
        throw new ApiError(
          422,
          `No outstanding balance for QUANTITY_INCREASE_DELTA (finalTotalPayable=${contribution.finalTotalPayableMinor}, paid=${alreadyPaid}).`
        );
      }
      return { amountMinor: delta, currency: contribution.currency ?? "INR" };
    }

    case "POST_APPROVAL_FINAL": {
      if (!snapshot) {
        throw new ApiError(422, "priceSnapshotId is required for POST_APPROVAL_FINAL payments.");
      }
      const share = snapshot.memberShares?.find(
        (s) => s.contributionId?.toString() === contribution._id.toString()
      );
      if (!share) {
        throw new ApiError(404, "This contribution is not listed in the supplied PriceSnapshot.");
      }
      const delta = share.totalPayableMinor - alreadyPaid;
      if (delta <= 0) {
        throw new ApiError(
          422,
          `No outstanding balance for POST_APPROVAL_FINAL (snapshotShare=${share.totalPayableMinor}, paid=${alreadyPaid}).`
        );
      }
      return { amountMinor: delta, currency: snapshot.currency ?? "INR" };
    }

    case "UNDER_MOQ_SURCHARGE": {
      const surcharge = contribution.finalTotalPayableMinor - alreadyPaid;
      if (surcharge <= 0) {
        throw new ApiError(
          422,
          `No outstanding surcharge for UNDER_MOQ_SURCHARGE (finalTotalPayable=${contribution.finalTotalPayableMinor}, paid=${alreadyPaid}).`
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

export async function createPaymentOrder({
  contributionId,
  paymentPurpose,
  idempotencyKey,
  payerUserId,
  priceSnapshotId = null,
  returnUrl = `${process.env.CLIENT_URL ?? "http://localhost:5173"}/payments/success`,
  cancelUrl = `${process.env.CLIENT_URL ?? "http://localhost:5173"}/payments/cancel`,
}) {
  const existing = await Payment.findOne({ idempotencyKey });
  if (existing) {
    return { payment: existing, approveUrl: null, isDuplicate: true };
  }

  const Contribution = getContribution();
  const contribution = await Contribution.findById(contributionId);

  if (!contribution) {
    throw new ApiError(404, `Contribution not found: ${contributionId}`);
  }

  if (contribution.createdByUserId?.toString() !== payerUserId.toString()) {
    throw new ApiError(403, "You are not authorised to create a payment for this contribution.");
  }

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

  const { amountMinor, currency } = derivePayableAmount(paymentPurpose, contribution, snapshot);

  const adapter = getPayPalAdapter();
  const isMock = process.env.PAYMENT_MODE?.toLowerCase() === "mock";
  const provider = isMock ? "MOCK_DEV" : "PAYPAL_SANDBOX";

  const pool = await getGroupBuyPool().findById(contribution.poolId).lean();
  const description = pool?.title
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
    throw new ApiError(502, `Payment provider error while creating order: ${err.message}`);
  }

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
    isTestTransaction: true,
  });

  return {
    payment,
    approveUrl: adapterResult.approveUrl,
    isDuplicate: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. capturePaymentOrder (Concurrency & Strict Idempotency Protected)
// ─────────────────────────────────────────────────────────────────────────────

export async function capturePaymentOrder({
  paymentId,
  providerOrderId,
  captureRequesterId,
}) {
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    throw new ApiError(404, `Payment not found: ${paymentId}`);
  }

  if (payment.payerUserId?.toString() !== captureRequesterId.toString()) {
    throw new ApiError(403, "You are not authorised to capture this payment.");
  }

  if (payment.paymentStatus === "PAID") {
    const Contribution = getContribution();
    const contribution = await Contribution.findById(payment.contributionId);
    return { payment, contribution, isDuplicate: true };
  }

  const capturableStatuses = ["CREATED", "CAPTURE_PENDING"];
  if (!capturableStatuses.includes(payment.paymentStatus)) {
    throw new ApiError(
      409,
      `Payment is in status '${payment.paymentStatus}' and cannot be captured. Only CREATED or CAPTURE_PENDING payments can be captured.`
    );
  }

  if (payment.providerOrderId !== providerOrderId) {
    throw new ApiError(
      400,
      "providerOrderId does not match the stored PayPal order ID for this payment."
    );
  }

  // ── Concurrency Guard: Atomic lock CREATED -> CAPTURE_PENDING ───────────────
  const lockedPayment = await Payment.findOneAndUpdate(
    { _id: paymentId, paymentStatus: "CREATED" },
    { paymentStatus: "CAPTURE_PENDING" },
    { returnDocument: "after" }
  );

  if (!lockedPayment) {
    // Another concurrent request beat us to the lock.
    // Wait up to 3 seconds for the winning capture to finish and set PAID.
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const current = await Payment.findById(paymentId);
      if (current.paymentStatus === "PAID") {
        const Contribution = getContribution();
        const contribution = await Contribution.findById(current.contributionId);
        return { payment: current, contribution, isDuplicate: true };
      }
      if (current.paymentStatus === "FAILED" || current.paymentStatus === "CANCELLED") {
        throw new ApiError(409, `Payment capture failed with status '${current.paymentStatus}'.`);
      }
    }
  }

  // ── Call PayPal adapter to capture ──────────────────────────────────────────
  const adapter = getPayPalAdapter();
  let captureResult;

  try {
    captureResult = await adapter.captureOrder(
      providerOrderId,
      `capture-${payment.idempotencyKey}`
    );
  } catch (err) {
    await Payment.findByIdAndUpdate(paymentId, {
      paymentStatus: "FAILED",
      safeErrorCode: "CAPTURE_API_ERROR",
    });
    throw new ApiError(502, `PayPal capture failed: ${err.message}`);
  }

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

  // ── Atomic update: Payment + Contribution ──────────────────────────────────
  const isReplicaSet =
    mongoose.connection.client?.topology?.description?.type !== "Single";

  let updatedPayment;
  let updatedContribution;

  if (isReplicaSet) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        updatedPayment = await Payment.findOneAndUpdate(
          { _id: paymentId, paymentStatus: { $ne: "PAID" } },
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
        if (updatedPayment) {
          updatedContribution = await Contribution.findByIdAndUpdate(
            payment.contributionId,
            { $inc: { totalPaidMinor: payment.amountMinor }, state: "ACTIVE" },
            { returnDocument: "after", session }
          );
        } else {
          updatedPayment = await Payment.findById(paymentId).session(session);
          updatedContribution = await Contribution.findById(payment.contributionId).session(session);
        }

        await safeRecalculatePool(payment.poolId, session);
      });
    } finally {
      await session.endSession();
    }
  } else {
    // Standalone fallback: atomically claim PAID status
    updatedPayment = await Payment.findOneAndUpdate(
      { _id: paymentId, paymentStatus: { $ne: "PAID" } },
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
    if (updatedPayment) {
      // Only increment Contribution if THIS atomic update successfully transitioned Payment to PAID
      updatedContribution = await Contribution.findByIdAndUpdate(
        payment.contributionId,
        { $inc: { totalPaidMinor: payment.amountMinor }, state: "ACTIVE" },
        { returnDocument: "after" }
      );
    } else {
      updatedPayment = await Payment.findById(paymentId);
      updatedContribution = await Contribution.findById(payment.contributionId);
      return { payment: updatedPayment, contribution: updatedContribution, isDuplicate: true };
    }

    await safeRecalculatePool(payment.poolId, null);
  }

  await safeLogAudit({
    actorId: captureRequesterId,
    actorRole: "SHOP_OWNER",
    action: "PAYMENT_CAPTURED",
    resourceType: "PAYMENT",
    resourceId: payment._id,
    poolId: payment.poolId,
    metadata: { providerCaptureId: captureResult.providerCaptureId },
  });

  return { payment: updatedPayment, contribution: updatedContribution, isDuplicate: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. handleCancelledOrFailedCheckout
// ─────────────────────────────────────────────────────────────────────────────

export async function handleCancelledOrFailedCheckout(paymentId, reason) {
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    throw new ApiError(404, `Payment not found: ${paymentId}`);
  }

  const terminalStatuses = ["PAID", "CANCELLED", "FAILED", "REFUNDED"];
  if (terminalStatuses.includes(payment.paymentStatus)) {
    return payment;
  }

  const newStatus = reason === "CANCELLED" ? "CANCELLED" : "FAILED";
  const updated = await Payment.findByIdAndUpdate(
    paymentId,
    { paymentStatus: newStatus },
    { returnDocument: "after" }
  );
  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. listPaymentsForShop
// ─────────────────────────────────────────────────────────────────────────────

export async function listPaymentsForShop(shopId, { page = 1, limit = 20 } = {}) {
  const safePage = Math.max(1, parseInt(page, 10));
  const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10)));
  const skip = (safePage - 1) * safeLimit;

  const [payments, total] = await Promise.all([
    Payment.find({ shopId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .select("-providerResponseSnapshot")
      .lean(),
    Payment.countDocuments({ shopId }),
  ]);

  return { payments, total, page: safePage, limit: safeLimit };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. verifyWebhookSignature (Cryptographic & Header Verification — SRU-03)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates incoming PayPal webhook transmission headers and signature.
 *
 * @param {object} params
 * @param {object} params.headers
 * @param {object} params.body
 * @param {string} [params.webhookId]
 * @returns {Promise<boolean>}
 */
export async function verifyWebhookSignature({ headers = {}, body = {}, webhookId = null }) {
  const transmissionSig =
    headers["paypal-transmission-sig"] ||
    headers["PAYPAL-TRANSMISSION-SIG"] ||
    headers["paypal-transmission-sig".toLowerCase()];

  const transmissionId =
    headers["paypal-transmission-id"] ||
    headers["PAYPAL-TRANSMISSION-ID"] ||
    headers["paypal-transmission-id".toLowerCase()];

  const transmissionTime =
    headers["paypal-transmission-time"] ||
    headers["PAYPAL-TRANSMISSION-TIME"] ||
    headers["paypal-transmission-time".toLowerCase()];

  const certUrl =
    headers["paypal-cert-url"] ||
    headers["PAYPAL-CERT-URL"] ||
    headers["paypal-cert-url".toLowerCase()];

  const authAlgo =
    headers["paypal-auth-algo"] ||
    headers["PAYPAL-AUTH-ALGO"] ||
    headers["paypal-auth-algo".toLowerCase()];

  if (!transmissionSig) {
    throw new ApiError(400, "Missing PAYPAL-TRANSMISSION-SIG header in webhook request.");
  }

  const expectedWebhookId = process.env.PAYPAL_WEBHOOK_ID;
  const targetWebhookId = webhookId || expectedWebhookId;

  if (expectedWebhookId && webhookId && webhookId !== expectedWebhookId) {
    throw new ApiError(400, "Webhook ID verification failed: webhook ID mismatch.");
  }

  const adapter = getPayPalAdapter();
  let verification;
  try {
    verification = await adapter.verifyWebhookSignature({
      authAlgo,
      certUrl,
      transmissionId,
      transmissionSig,
      transmissionTime,
      webhookId: targetWebhookId,
      eventBody: body,
    });
  } catch (err) {
    throw new ApiError(400, `Webhook signature verification threw error: ${err.message}`);
  }

  if (verification?.verificationStatus !== "SUCCESS") {
    throw new ApiError(400, "Webhook signature verification failed.");
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. handlePayPalWebhook (Strict Idempotency — SRU-03)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handles incoming PayPal webhook events with cryptographic verification
 * and duplicate delivery protection.
 *
 * @param {object} params
 * @param {object} params.headers
 * @param {object} params.body
 * @returns {Promise<object>}
 */
export async function handlePayPalWebhook({ headers = {}, body = {} }) {
  await verifyWebhookSignature({ headers, body });

  const event = body;
  const eventType = event.event_type;

  switch (eventType) {
    case "PAYMENT.CAPTURE.COMPLETED":
    case "CHECKOUT.ORDER.COMPLETED": {
      const resource = event.resource || {};
      const providerCaptureId = resource.id;
      const providerOrderId =
        resource.supplementary_data?.related_ids?.order_id ||
        resource.order_id ||
        resource.custom_id;

      // Locate Payment record
      const query = [];
      if (providerCaptureId) query.push({ providerCaptureId });
      if (providerOrderId) query.push({ providerOrderId });
      if (resource.custom_id && mongoose.isValidObjectId(resource.custom_id)) {
        query.push({ _id: resource.custom_id });
      }

      if (query.length === 0) {
        return { received: true, processed: false, reason: "No provider identifier in webhook resource." };
      }

      const payment = await Payment.findOne({ $or: query });
      if (!payment) {
        return {
          received: true,
          processed: false,
          reason: `Payment not found for webhook order '${providerOrderId}' / capture '${providerCaptureId}'.`,
        };
      }

      // Idempotency check: if already captured or duplicate webhook
      if (payment.paymentStatus === "PAID" || (payment.providerCaptureId && payment.providerCaptureId === providerCaptureId)) {
        return {
          received: true,
          processed: false,
          isDuplicate: true,
          paymentId: payment._id,
          message: "Payment already captured (idempotent acknowledgement).",
        };
      }

      // Atomically transition payment to PAID
      const updatedPayment = await Payment.findOneAndUpdate(
        { _id: payment._id, paymentStatus: { $in: ["CREATED", "CAPTURE_PENDING"] } },
        {
          paymentStatus: "PAID",
          providerCaptureId: providerCaptureId || payment.providerCaptureId,
          capturedAt: new Date(),
          providerResponseSnapshot: {
            webhookEventId: event.id,
            eventType,
            captureId: providerCaptureId,
            status: resource.status,
          },
        },
        { returnDocument: "after" }
      );

      if (!updatedPayment) {
        // Another concurrent request or webhook already updated it to PAID
        return {
          received: true,
          processed: false,
          isDuplicate: true,
          paymentId: payment._id,
          message: "Payment already captured by concurrent process.",
        };
      }

      // Update Contribution totalPaidMinor and state
      const Contribution = getContribution();
      await Contribution.findByIdAndUpdate(
        payment.contributionId,
        { $inc: { totalPaidMinor: payment.amountMinor }, state: "ACTIVE" },
        { returnDocument: "after" }
      );

      await safeRecalculatePool(payment.poolId, null);

      await safeLogAudit({
        actorRole: "WEBHOOK",
        action: "PAYMENT_CAPTURED",
        resourceType: "PAYMENT",
        resourceId: payment._id,
        poolId: payment.poolId,
        metadata: { providerCaptureId, providerOrderId, webhookEventId: event.id },
      });

      await safeSendNotification({
        recipientUserId: payment.payerUserId,
        type: "PAYMENT_VERIFIED",
        title: "Payment Verified",
        message: `Your payment of ${payment.amountMinor} paise has been successfully captured and verified.`,
        resourceType: "PAYMENT",
        resourceId: payment._id,
        poolId: payment.poolId,
      });

      return {
        received: true,
        processed: true,
        isDuplicate: false,
        paymentId: payment._id,
        paymentStatus: "PAID",
      };
    }

    case "PAYMENT.CAPTURE.DENIED":
    case "PAYMENT.CAPTURE.DECLINED": {
      const resource = event.resource || {};
      const providerOrderId =
        resource.supplementary_data?.related_ids?.order_id || resource.order_id;

      if (providerOrderId) {
        const payment = await Payment.findOne({ providerOrderId });
        if (payment && !["PAID", "CANCELLED", "REFUNDED"].includes(payment.paymentStatus)) {
          await Payment.findByIdAndUpdate(payment._id, {
            paymentStatus: "FAILED",
            safeErrorCode: "WEBHOOK_CAPTURE_DENIED",
          });
        }
      }
      return { received: true, processed: true, paymentStatus: "FAILED" };
    }

    default:
      return { received: true, processed: false, eventType, message: "Ignored webhook event type." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. reconcilePaymentState (Automated & Network Timeout Recovery — SRU-03)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reconciles payment state with PayPal when in UNKNOWN or CAPTURE_PENDING.
 *
 * @param {string} paymentId
 * @returns {Promise<{ payment: object, reconciled: boolean, newStatus?: string, alreadySettled?: boolean }>}
 */
export async function reconcilePaymentState(paymentId) {
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    throw new ApiError(404, `Payment not found: ${paymentId}`);
  }

  if (payment.paymentStatus === "PAID") {
    return { payment, reconciled: false, alreadySettled: true, message: "Payment is already captured." };
  }

  const terminalStatuses = ["FAILED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"];
  if (terminalStatuses.includes(payment.paymentStatus)) {
    return {
      payment,
      reconciled: false,
      alreadySettled: true,
      message: `Payment is in terminal status '${payment.paymentStatus}'.`,
    };
  }

  const adapter = getPayPalAdapter();
  let orderDetails;
  try {
    orderDetails = await adapter.getOrderDetails(payment.providerOrderId);
  } catch (err) {
    throw new ApiError(502, `Failed to query payment provider during reconciliation: ${err.message}`);
  }

  if (!orderDetails) {
    throw new ApiError(502, "Provider returned empty order details during reconciliation.");
  }

  const orderStatus = orderDetails.status;
  const captures = orderDetails.purchase_units?.[0]?.payments?.captures || [];
  const completedCapture = captures.find((c) => c.status === "COMPLETED") || captures[0];

  if (orderStatus === "COMPLETED" || completedCapture?.status === "COMPLETED") {
    const providerCaptureId =
      completedCapture?.id ||
      payment.providerCaptureId ||
      `MOCK-CAP-${payment.providerOrderId.slice(9) || Date.now()}`;

    const updated = await Payment.findOneAndUpdate(
      { _id: paymentId, paymentStatus: { $ne: "PAID" } },
      {
        paymentStatus: "PAID",
        providerCaptureId,
        capturedAt: new Date(),
        providerResponseSnapshot: {
          reconciled: true,
          providerOrderId: payment.providerOrderId,
          captureId: providerCaptureId,
          status: "COMPLETED",
        },
      },
      { returnDocument: "after" }
    );

    if (updated) {
      const Contribution = getContribution();
      await Contribution.findByIdAndUpdate(
        payment.contributionId,
        { $inc: { totalPaidMinor: payment.amountMinor }, state: "ACTIVE" },
        { returnDocument: "after" }
      );

      await safeRecalculatePool(payment.poolId, null);

      await safeLogAudit({
        actorRole: "SYSTEM_SCHEDULER",
        action: "PAYMENT_RECONCILED",
        resourceType: "PAYMENT",
        resourceId: payment._id,
        poolId: payment.poolId,
        metadata: { providerCaptureId, providerOrderId: payment.providerOrderId },
      });

      return { payment: updated, reconciled: true, newStatus: "PAID" };
    }

    return { payment, reconciled: false, alreadySettled: true };
  }

  if (orderStatus === "VOIDED" || orderStatus === "EXPIRED") {
    const updated = await Payment.findByIdAndUpdate(
      paymentId,
      {
        paymentStatus: "FAILED",
        safeErrorCode: `PROVIDER_ORDER_${orderStatus}`,
      },
      { returnDocument: "after" }
    );
    return { payment: updated, reconciled: true, newStatus: "FAILED" };
  }

  return {
    payment,
    reconciled: false,
    message: `Provider order is in status '${orderStatus}'; no state change required.`,
  };
}

export default {
  createPaymentOrder,
  capturePaymentOrder,
  handleCancelledOrFailedCheckout,
  listPaymentsForShop,
  verifyWebhookSignature,
  handlePayPalWebhook,
  reconcilePaymentState,
};
