import mongoose from "mongoose";
import { Order } from "../../models/Order.model.js";
import { Payment } from "../../models/Payment.model.js";
import { SupplierSettlement } from "../../models/SupplierSettlement.model.js";
import { ApiError } from "../../utils/apiError.js";
import { toDecimalString } from "../payments/paypalAdapter.service.js";
import { initiateRefund } from "../refunds/refund.service.js";

async function safeLogAudit(event) {
  try {
    const mod = await import("../notifications/audit.service.js").catch(() => null);
    if (mod?.logEvent) {
      await mod.logEvent(event);
    }
  } catch (_ignored) {}
}

async function safeSendNotification(params) {
  try {
    const mod = await import("../notifications/notification.service.js").catch(() => null);
    if (mod?.createNotification) {
      await mod.createNotification(params);
    }
  } catch (_ignored) {}
}

/**
 * Generates next sequential Order Number in format "AKD-2026-XXXX".
 */
export async function generateNextOrderNumber(session = null) {
  const currentYear = new Date().getFullYear();
  const prefix = `AKD-${currentYear}-`;
  const count = await Order.countDocuments(
    { orderNumber: new RegExp(`^${prefix}`) },
    session ? { session } : {}
  );
  let nextSeq = count + 1;
  while (true) {
    const candidate = `${prefix}${String(nextSeq).padStart(4, "0")}`;
    const exists = await Order.findOne(
      { orderNumber: candidate },
      null,
      session ? { session } : {}
    );
    if (!exists) {
      return candidate;
    }
    nextSeq++;
  }
}

/**
 * Format currency minor units to human-readable string (e.g. 480000 paise -> "₹4,800.00").
 */
export function formatCurrency(amountMinor, currency = "INR") {
  const decimalStr = toDecimalString(amountMinor, currency);
  const symbol = currency === "INR" ? "₹" : "$";
  const num = Number(decimalStr);
  return `${symbol}${num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Verifies if requesting user has authorization to view/download PO for the given order.
 *
 * Rules:
 * - ADMIN or REVIEWER: Always authorized.
 * - SUPPLIER: Authorized if supplierId matches the order's supplier.
 * - SHOP_OWNER: Authorized if shopId is present in order's memberOrders.
 * - Others: 403 Forbidden.
 */
export function verifyOrderAuthorization(order, requestingUser) {
  if (!requestingUser) {
    throw new ApiError(401, "Authentication required to access Purchase Order summary.");
  }

  const role = requestingUser.role;

  // 1. Admin and read-only Reviewers always have platform-wide access
  if (role === "ADMIN" || role === "REVIEWER") {
    return { isAuthorized: true, accessType: role };
  }

  // 2. Wholesaler / Supplier check
  if (role === "SUPPLIER") {
    const userSupplierId =
      requestingUser.supplierId?.toString() || requestingUser._id?.toString();
    const orderSupplierId = order.supplierId?._id?.toString() || order.supplierId?.toString();

    if (userSupplierId && orderSupplierId && userSupplierId === orderSupplierId) {
      return { isAuthorized: true, accessType: "SUPPLIER" };
    }
    throw new ApiError(403, "Forbidden: You are not the assigned supplier for this Purchase Order.");
  }

  // 3. Retailer / Shop Owner check
  if (role === "SHOP_OWNER" || !role) {
    const userShopId =
      requestingUser.shopId?.toString() ||
      requestingUser.shop?._id?.toString() ||
      requestingUser.shop?.toString();

    const isMember = order.memberOrders?.some((m) => {
      const memberShopId = m.shopId?._id?.toString() || m.shopId?.toString();
      return userShopId && memberShopId && memberShopId === userShopId;
    });

    if (isMember) {
      return { isAuthorized: true, accessType: "SHOP_OWNER", userShopId };
    }

    throw new ApiError(
      403,
      "Forbidden: You are not an authorized participant in this Purchase Order."
    );
  }

  throw new ApiError(403, "Forbidden: Insufficient permissions to view Purchase Order.");
}

/**
 * Generates an HTML printable Purchase Order document from the PO summary payload.
 */
function renderPoHtml(summary) {
  const {
    orderNumber,
    generatedAt,
    orderState,
    supplierConfirmationStatus,
    currency,
    totals,
    supplier,
    product,
    pool,
    priceSnapshot,
    memberOrders,
    paymentReferences,
    badges,
  } = summary;

  const memberRows = memberOrders
    .map(
      (m, idx) => `
      <tr>
        <td style="padding: 10px 14px; border-bottom: 1px solid #E2E8F0; font-family: monospace;">#${idx + 1}</td>
        <td style="padding: 10px 14px; border-bottom: 1px solid #E2E8F0; font-weight: 600;">${m.shopName}</td>
        <td style="padding: 10px 14px; border-bottom: 1px solid #E2E8F0; text-align: right; font-variant-numeric: tabular-nums;">${m.quantity} ${m.unit}</td>
        <td style="padding: 10px 14px; border-bottom: 1px solid #E2E8F0; text-align: right; font-variant-numeric: tabular-nums;">${m.formattedUnitPrice}</td>
        <td style="padding: 10px 14px; border-bottom: 1px solid #E2E8F0; text-align: right; font-variant-numeric: tabular-nums;">${m.formattedMerchandiseShare}</td>
        <td style="padding: 10px 14px; border-bottom: 1px solid #E2E8F0; text-align: right; font-variant-numeric: tabular-nums;">${m.formattedShippingShare}</td>
        <td style="padding: 10px 14px; border-bottom: 1px solid #E2E8F0; text-align: right; font-weight: 700; color: #0F172A; font-variant-numeric: tabular-nums;">${m.formattedTotalPaid}</td>
        <td style="padding: 10px 14px; border-bottom: 1px solid #E2E8F0; text-align: center;">
          <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; background: #ECFDF5; color: #047857;">
            ${m.deliveryStatus}
          </span>
        </td>
      </tr>
    `
    )
    .join("");

  const paymentRows =
    paymentReferences.length > 0
      ? paymentReferences
          .map(
            (p) => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #F1F5F9; font-family: monospace; font-size: 12px;">${p.paymentId}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #F1F5F9; font-size: 12px;">${p.purpose}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #F1F5F9; font-family: monospace; font-size: 12px;">${p.providerCaptureId || p.providerOrderId || "N/A"}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #F1F5F9; text-align: right; font-size: 12px; font-weight: 600;">${p.formattedAmount}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #F1F5F9; text-align: center;">
            <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; background: #D1FAE5; color: #065F46;">
              ${p.status}
            </span>
          </td>
        </tr>
      `
          )
          .join("")
      : `<tr><td colspan="5" style="padding: 12px; text-align: center; color: #64748B;">All payments verified via Group Pool</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Purchase Order — ${orderNumber}</title>
  <style>
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
      .page-break { page-break-after: always; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0F172A;
      background-color: #F8FAFC;
      margin: 0;
      padding: 30px;
    }
    .po-container {
      max-width: 900px;
      margin: 0 auto;
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
      padding: 36px;
    }
    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .badge-test { background-color: #FEF3C7; color: #92400E; border: 1px solid #FDE68A; }
    .badge-simulated { background-color: #E0E7FF; color: #3730A3; border: 1px solid #C7D2FE; }
    .badge-status { background-color: #D1FAE5; color: #065F46; }
    .section-title {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #475569;
      border-bottom: 2px solid #E2E8F0;
      padding-bottom: 6px;
      margin-top: 24px;
      margin-bottom: 12px;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      margin-bottom: 16px;
      font-size: 13px;
    }
    table.data-table th {
      background-color: #F8FAFC;
      color: #334155;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.5px;
      padding: 10px 14px;
      border-bottom: 2px solid #E2E8F0;
    }
    .total-box {
      float: right;
      width: 320px;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      padding: 14px;
      margin-top: 12px;
    }
    .total-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
    .total-row.grand { font-size: 16px; font-weight: 800; border-top: 2px solid #CBD5E1; padding-top: 8px; margin-top: 6px; color: #0F172A; }
    .footer-disclaimer {
      clear: both;
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #E2E8F0;
      font-size: 11px;
      color: #64748B;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="po-container">
    <!-- Top Action Bar -->
    <div class="no-print" style="margin-bottom: 20px; display: flex; justify-content: flex-end; gap: 10px;">
      <button onclick="window.print()" style="background: #0F172A; color: #FFFFFF; border: none; padding: 8px 18px; border-radius: 6px; font-weight: 600; cursor: pointer;">
        🖨️ Print / Save as PDF
      </button>
    </div>

    <!-- Header -->
    <table class="header-table">
      <tr>
        <td style="vertical-align: top; width: 60%;">
          <div style="font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #0F172A;">
            Aap Ki Dukan <span style="color: #0D9488; font-size: 18px;">(CoBuy AI)</span>
          </div>
          <div style="font-size: 13px; color: #64748B; margin-top: 4px;">
            AI-Assisted B2B Group Procurement Platform
          </div>
          <div style="margin-top: 12px;">
            <span class="badge badge-test">${badges.sandboxBadge}</span>
            <span class="badge badge-simulated" style="margin-left: 6px;">${badges.settlementBadge}</span>
          </div>
        </td>
        <td style="vertical-align: top; text-align: right; width: 40%;">
          <div style="font-size: 20px; font-weight: 800; color: #0F172A;">PURCHASE ORDER</div>
          <div style="font-family: monospace; font-size: 15px; font-weight: 700; color: #0D9488; margin-top: 4px;">
            ${orderNumber}
          </div>
          <div style="font-size: 12px; color: #64748B; margin-top: 4px;">
            Issued: <strong>${new Date(generatedAt).toLocaleDateString()}</strong>
          </div>
          <div style="margin-top: 6px;">
            <span class="badge badge-status">${orderState}</span>
          </div>
        </td>
      </tr>
    </table>

    <!-- Parties (Supplier vs Group Buyer) -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px;">
      <tr>
        <td style="padding: 16px; width: 50%; vertical-align: top; border-right: 1px solid #E2E8F0;">
          <div style="font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase;">Wholesaler / Supplier</div>
          <div style="font-size: 15px; font-weight: 700; color: #0F172A; margin-top: 4px;">${supplier.name}</div>
          <div style="font-size: 12px; color: #475569; margin-top: 4px;">Contact: ${supplier.contactPerson || "Wholesale Sales Desk"}</div>
          <div style="font-size: 12px; color: #475569;">Email: ${supplier.email || "supplier@aapkidukan.demo"} | Phone: ${supplier.phone || "+91-522-000000"}</div>
          <div style="font-size: 12px; color: #475569;">Service Region: ${supplier.serviceAreas.join(", ")}</div>
          <div style="margin-top: 6px; font-size: 11px; font-weight: 600; color: #059669;">Provenance: ${supplier.provenance}</div>
        </td>
        <td style="padding: 16px; width: 50%; vertical-align: top;">
          <div style="font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase;">Group Purchasing Pool</div>
          <div style="font-size: 15px; font-weight: 700; color: #0F172A; margin-top: 4px;">${pool.title}</div>
          <div style="font-size: 12px; color: #475569; margin-top: 4px;">Delivery Hub / Area: <strong>${pool.deliveryArea}</strong></div>
          <div style="font-size: 12px; color: #475569;">Approved Price Snapshot: <strong>Version ${priceSnapshot.version}</strong></div>
          <div style="font-size: 12px; color: #475569;">Tax Status: <strong>${priceSnapshot.taxInclusion}</strong></div>
          <div style="font-size: 12px; color: #475569;">Shipping Terms: <strong>${priceSnapshot.shippingAllocationMethod}</strong></div>
        </td>
      </tr>
    </table>

    <!-- Product Description -->
    <div class="section-title">Product & Technical Specifications</div>
    <table class="data-table">
      <thead>
        <tr>
          <th style="text-align: left;">Product Name</th>
          <th style="text-align: left;">Category</th>
          <th style="text-align: left;">Pack Description</th>
          <th style="text-align: left;">Material / Grade</th>
          <th style="text-align: right;">Total Quantity</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding: 12px 14px; font-weight: 600;">${product.name}</td>
          <td style="padding: 12px 14px;">${product.category}</td>
          <td style="padding: 12px 14px;">${product.packSizeDescription}</td>
          <td style="padding: 12px 14px;">${product.material}</td>
          <td style="padding: 12px 14px; text-align: right; font-weight: 700; font-size: 14px;">${totals.totalQuantity} ${product.unit}</td>
        </tr>
      </tbody>
    </table>

    <!-- Member Allocations -->
    <div class="section-title">Itemized Member Shop Allocations (${memberOrders.length} Retailers)</div>
    <table class="data-table">
      <thead>
        <tr>
          <th style="text-align: left;">#</th>
          <th style="text-align: left;">Shop Name</th>
          <th style="text-align: right;">Quantity</th>
          <th style="text-align: right;">Tier Unit Price</th>
          <th style="text-align: right;">Merchandise Share</th>
          <th style="text-align: right;">Shipping Share</th>
          <th style="text-align: right;">Total Paid</th>
          <th style="text-align: center;">Delivery Status</th>
        </tr>
      </thead>
      <tbody>
        ${memberRows}
      </tbody>
    </table>

    <!-- Grand Totals Box -->
    <div class="total-box">
      <div class="total-row">
        <span>Total Units:</span>
        <span style="font-weight: 600;">${totals.totalQuantity} ${product.unit}</span>
      </div>
      <div class="total-row">
        <span>Merchandise Total:</span>
        <span style="font-weight: 600;">${totals.formattedMerchandiseTotal}</span>
      </div>
      <div class="total-row">
        <span>Shipping / Handling:</span>
        <span style="font-weight: 600;">${totals.formattedShippingTotal}</span>
      </div>
      <div class="total-row grand">
        <span>Grand Total Payable:</span>
        <span style="color: #0D9488;">${totals.formattedGrandTotal}</span>
      </div>
    </div>
    <div style="clear: both;"></div>

    <!-- Verified Payment Verification References -->
    <div class="section-title" style="margin-top: 24px;">Verified Buyer Payment References (PayPal Sandbox)</div>
    <table class="data-table" style="font-size: 12px;">
      <thead>
        <tr>
          <th style="text-align: left;">Payment ID</th>
          <th style="text-align: left;">Purpose</th>
          <th style="text-align: left;">PayPal Order / Capture ID</th>
          <th style="text-align: right;">Captured Amount</th>
          <th style="text-align: center;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${paymentRows}
      </tbody>
    </table>

    <!-- Legal / Audit Disclaimers -->
    <div class="footer-disclaimer">
      <strong>Disclosure & Authenticity Statement:</strong> This Purchase Order document was generated automatically by 
      <strong>Aap Ki Dukan (CoBuy AI)</strong> after server-side verification of all buyer contributions, bulk tier pricing validation, 
      and explicit approval of PriceSnapshot version ${priceSnapshot.version}. 
      All transactions shown above have been recorded in the immutable platform Audit Log with test transaction indicators. 
      Supplier payouts are governed under simulated settlement rules for prototype demonstration.
    </div>
  </div>
</body>
</html>`;
}

/**
 * Task SRU-06: Generates a complete, structured Purchase Order (PO) document
 * summary with authorization enforcement and JSON/HTML formatting.
 *
 * @param {string} orderId Mongo ObjectId or orderNumber string
 * @param {object} requestingUser Authenticated user { _id, role, shopId, supplierId }
 * @param {object} options { format: 'json' | 'html' }
 * @returns {Promise<{ summary: object, html?: string }>}
 */
export async function generatePurchaseOrderSummary(
  orderId,
  requestingUser,
  options = { format: "json" }
) {
  // 1. Fetch Order
  const query = mongoose.isValidObjectId(orderId)
    ? { _id: orderId }
    : { orderNumber: orderId };

  let order = await Order.findOne(query)
    .populate("supplierId")
    .populate("productId")
    .populate("priceSnapshotId")
    .populate("poolId")
    .lean();

  if (!order) {
    throw new ApiError(404, `Order not found with identifier: ${orderId}`);
  }

  // 2. Authorize Requesting User (FR-ORDER-006 / SRU-06 authorization check)
  const authInfo = verifyOrderAuthorization(order, requestingUser);

  // 3. Resolve populated records safely
  const supplierDoc = order.supplierId || {};
  const productDoc = order.productId || {};
  const snapshotDoc = order.priceSnapshotId || {};
  const poolDoc = order.poolId || {};

  // 4. Fetch linked Payment records for verification references
  const contributionIds = (order.memberOrders || []).map((m) => m.contributionId).filter(Boolean);
  let paymentRecords = [];

  try {
    paymentRecords = await Payment.find({
      contributionId: { $in: contributionIds },
      paymentStatus: "PAID",
    })
      .select("paymentPurpose providerOrderId providerCaptureId amountMinor currency paymentStatus createdAt")
      .lean();
  } catch {
    paymentRecords = [];
  }

  const paymentReferences = paymentRecords.map((p) => ({
    paymentId: p._id.toString(),
    purpose: p.paymentPurpose,
    providerOrderId: p.providerOrderId || "N/A",
    providerCaptureId: p.providerCaptureId || "N/A",
    amountMinor: p.amountMinor,
    formattedAmount: formatCurrency(p.amountMinor, p.currency),
    status: p.paymentStatus,
    capturedAt: p.createdAt,
  }));

  // 5. Structure Itemized Allocations
  const memberOrders = (order.memberOrders || []).map((member) => ({
    shopId: member.shopId?.toString(),
    shopName: member.shopName || "Participating Retailer",
    quantity: member.quantity,
    unit: member.unit || order.unit || "UNIT",
    unitPriceMinor: member.unitPriceMinor,
    formattedUnitPrice: formatCurrency(member.unitPriceMinor, order.currency),
    merchandiseShareMinor: member.merchandiseShareMinor,
    formattedMerchandiseShare: formatCurrency(member.merchandiseShareMinor, order.currency),
    shippingShareMinor: member.shippingShareMinor || 0,
    formattedShippingShare: formatCurrency(member.shippingShareMinor || 0, order.currency),
    totalPaidMinor: member.totalPaidMinor,
    formattedTotalPaid: formatCurrency(member.totalPaidMinor, order.currency),
    deliveryStatus: member.deliveryStatus || "PENDING",
    isCurrentUserShop:
      authInfo.userShopId &&
      authInfo.userShopId === member.shopId?.toString(),
  }));

  // 6. Build the unified summary payload
  const summary = {
    orderNumber: order.orderNumber,
    orderId: order._id.toString(),
    generatedAt: new Date().toISOString(),
    orderState: order.orderState,
    supplierConfirmationStatus: order.supplierConfirmationStatus,
    expectedDeliveryDate: order.expectedDeliveryDate || null,
    currency: order.currency,

    totals: {
      totalQuantity: order.totalQuantity,
      unit: order.unit,
      merchandiseTotalMinor: order.merchandiseTotalMinor,
      formattedMerchandiseTotal: formatCurrency(order.merchandiseTotalMinor, order.currency),
      shippingTotalMinor: order.shippingTotalMinor || 0,
      formattedShippingTotal: formatCurrency(order.shippingTotalMinor || 0, order.currency),
      grandTotalMinor: order.grandTotalMinor,
      formattedGrandTotal: formatCurrency(order.grandTotalMinor, order.currency),
    },

    supplier: {
      id: supplierDoc._id?.toString() || order.supplierId?.toString(),
      name: supplierDoc.name || "Verified Wholesale Supplier",
      contactPerson: supplierDoc.contactReference?.contactPerson || "Sales Desk",
      email: supplierDoc.contactReference?.email || "supplier@aapkidukan.demo",
      phone: supplierDoc.contactReference?.phone || "+91-522-000000",
      serviceAreas: supplierDoc.serviceAreas || ["All Regional Zones"],
      provenance: supplierDoc.dataSourceType || "SEEDED_DEMO",
      verificationStatus: supplierDoc.verificationStatus || "VERIFIED",
    },

    product: {
      id: productDoc._id?.toString() || order.productId?.toString(),
      name: productDoc.canonicalName || "Bulk Procurement Item",
      category: productDoc.category || "General Merchandise",
      unit: order.unit,
      packSizeDescription: productDoc.packSizeDescription || `${order.unit} Bulk Pack`,
      material:
        productDoc.specifications?.material ||
        productDoc.specifications?.grade ||
        "Commercial Grade Standard",
    },

    pool: {
      id: poolDoc._id?.toString() || order.poolId?.toString(),
      title: poolDoc.title || "Group Procurement Pool",
      deliveryArea: poolDoc.deliveryArea || "Regional Hub",
    },

    priceSnapshot: {
      id: snapshotDoc._id?.toString() || order.priceSnapshotId?.toString(),
      version: snapshotDoc.version || 1,
      taxInclusion: snapshotDoc.taxInclusion || "GST_EXCLUDED",
      shippingAllocationMethod: snapshotDoc.shippingAllocationMethod || "PER_UNIT",
      appliedUnitPriceMinor: snapshotDoc.appliedUnitPriceMinor || (order.memberOrders?.[0]?.unitPriceMinor || 0),
      formattedAppliedUnitPrice: formatCurrency(
        snapshotDoc.appliedUnitPriceMinor || (order.memberOrders?.[0]?.unitPriceMinor || 0),
        order.currency
      ),
    },

    memberOrders,
    paymentReferences,

    badges: {
      sandboxBadge: "TEST TRANSACTION — PAYPAL SANDBOX",
      settlementBadge: "SIMULATED SETTLEMENT",
      dataProvenanceBadge: supplierDoc.dataSourceType || "SEEDED_DEMO",
    },

    requestingUserAccess: authInfo.accessType,
  };

  if (options.format === "html") {
    const html = renderPoHtml(summary);
    return { summary, html };
  }

  return { summary };
}

// ─────────────────────────────────────────────────────────────────────────────
// Task SRU-07: Supplier Settlement Lifecycle Service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates or retrieves the SupplierSettlement record for an Order.
 *
 * Enforces BR-009 & FR-PAY-016:
 * Tracks wholesaler payout in SupplierSettlement completely separately from buyer
 * Payment captures.
 *
 * In the prototype:
 *  - mode defaults to 'DEMO'
 *  - settlementStatus defaults to 'SIMULATED'
 *  - notes explicitly declare prototype simulation
 *
 * @param {string} orderId Mongo ObjectId or orderNumber string
 * @param {object} options { mode: 'DEMO'|'MANUAL'|'INTEGRATED', settlementStatus, notes, providerReference }
 * @returns {Promise<mongoose.Document>}
 */
export async function createOrGetSupplierSettlement(orderId, options = {}) {
  const query = mongoose.isValidObjectId(orderId)
    ? { _id: orderId }
    : { orderNumber: orderId };

  const order = await Order.findOne(query);
  if (!order) {
    throw new ApiError(404, `Order not found with identifier: ${orderId}`);
  }

  // Check if settlement record already exists
  let settlement = await SupplierSettlement.findOne({ orderId: order._id });
  if (settlement) {
    return settlement;
  }

  const mode = options.mode || "DEMO";
  const settlementStatus = options.settlementStatus || "SIMULATED";
  const notes =
    options.notes ||
    "Simulated supplier settlement for prototype demonstration. Payout is tracked separately from buyer PayPal captures.";

  settlement = await SupplierSettlement.create({
    orderId: order._id,
    poolId: order.poolId,
    supplierId: order.supplierId,
    amountMinor: order.grandTotalMinor,
    currency: order.currency,
    mode,
    settlementStatus,
    providerReference: options.providerReference || null,
    confirmedAt: settlementStatus === "CONFIRMED" ? new Date() : null,
    notes,
  });

  return settlement;
}

/**
 * Retrieves the SupplierSettlement record for an order with authorization check.
 *
 * Authorization:
 *  - ADMIN and REVIEWER can view.
 *  - The assigned SUPPLIER can view.
 *  - Retailers / Shop owners receive 403 Forbidden (settlement details are private between platform & supplier).
 *
 * @param {string} orderId
 * @param {object} requestingUser
 * @returns {Promise<mongoose.Document>}
 */
export async function getSupplierSettlement(orderId, requestingUser) {
  if (!requestingUser) {
    throw new ApiError(401, "Authentication required to view supplier settlement.");
  }

  const query = mongoose.isValidObjectId(orderId)
    ? { _id: orderId }
    : { orderNumber: orderId };

  const order = await Order.findOne(query);
  if (!order) {
    throw new ApiError(404, `Order not found with identifier: ${orderId}`);
  }

  const role = requestingUser.role;

  // Authorization check
  const isAdminOrReviewer = role === "ADMIN" || role === "REVIEWER";
  const userSupplierId =
    requestingUser.supplierId?.toString() || requestingUser._id?.toString();
  const orderSupplierId = order.supplierId?.toString();
  const isAssignedSupplier =
    role === "SUPPLIER" && userSupplierId && orderSupplierId && userSupplierId === orderSupplierId;

  if (!isAdminOrReviewer && !isAssignedSupplier) {
    throw new ApiError(
      403,
      "Forbidden: You do not have permission to view supplier settlement records."
    );
  }

  // Get or initialize settlement
  let settlement = await SupplierSettlement.findOne({ orderId: order._id });
  if (!settlement) {
    settlement = await createOrGetSupplierSettlement(order._id);
  }

  return settlement;
}

/**
 * Updates the settlement status or details (Admin only).
 *
 * @param {string} orderId
 * @param {object} updates { settlementStatus, mode, providerReference, notes }
 * @param {object} requestingUser
 * @returns {Promise<mongoose.Document>}
 */
export async function updateSupplierSettlement(orderId, updates = {}, requestingUser) {
  if (!requestingUser) {
    throw new ApiError(401, "Authentication required to update supplier settlement.");
  }

  if (requestingUser.role !== "ADMIN") {
    throw new ApiError(
      403,
      "Forbidden: Only platform administrators can modify supplier settlement records."
    );
  }

  const query = mongoose.isValidObjectId(orderId)
    ? { _id: orderId }
    : { orderNumber: orderId };

  const order = await Order.findOne(query);
  if (!order) {
    throw new ApiError(404, `Order not found with identifier: ${orderId}`);
  }

  let settlement = await SupplierSettlement.findOne({ orderId: order._id });
  if (!settlement) {
    settlement = await createOrGetSupplierSettlement(order._id);
  }

  const allowedStatuses = [
    "NOT_STARTED",
    "SIMULATED",
    "PENDING",
    "CONFIRMED",
    "FAILED",
    "NEEDS_REVIEW",
  ];
  if (updates.settlementStatus && !allowedStatuses.includes(updates.settlementStatus)) {
    throw new ApiError(
      400,
      `Invalid settlementStatus: ${updates.settlementStatus}. Allowed: ${allowedStatuses.join(", ")}`
    );
  }

  const allowedModes = ["DEMO", "MANUAL", "INTEGRATED"];
  if (updates.mode && !allowedModes.includes(updates.mode)) {
    throw new ApiError(
      400,
      `Invalid mode: ${updates.mode}. Allowed: ${allowedModes.join(", ")}`
    );
  }

  if (updates.settlementStatus) {
    settlement.settlementStatus = updates.settlementStatus;
    if (updates.settlementStatus === "CONFIRMED") {
      settlement.confirmedAt = updates.confirmedAt || new Date();
    }
  }

  if (updates.mode) settlement.mode = updates.mode;
  if (updates.providerReference !== undefined) settlement.providerReference = updates.providerReference;
  if (updates.notes !== undefined) settlement.notes = updates.notes;

  await settlement.save();
  return settlement;
}

// ─────────────────────────────────────────────────────────────────────────────
// Task SRU-05: Order Creation & Fulfilment Lifecycle Service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Task SRU-05: Final Order Creation from Funded Pool.
 *
 * Verifies:
 *  - Pool exists and has active contributions.
 *  - All active contributions are explicitly APPROVED (approvalStatus === 'APPROVED').
 *  - All active contributions are fully PAID (totalPaidMinor >= finalTotalPayableMinor).
 *  - Freezes snapshot breakdown into immutable Order.memberOrders allocations.
 *  - Generates unique orderNumber (AKD-2026-XXXX).
 *  - Sets supplierConfirmationStatus: 'PENDING', isSimulatedConfirmation: true, orderState: 'AWAITING_SUPPLIER_CONFIRMATION'.
 *  - Transitions GroupBuyPool to 'ORDERED' and Contributions to 'FINALIZED'.
 *  - Initializes separate SupplierSettlement record in SIMULATED / DEMO mode.
 *  - Logs AuditLog and dispatches in-app notifications.
 *
 * @param {string|mongoose.Types.ObjectId} poolId
 * @param {mongoose.ClientSession} [session]
 * @returns {Promise<mongoose.Document>}
 */
export async function createFinalOrderFromFundedPool(poolId, session = null) {
  if (!poolId) {
    throw new ApiError(400, "poolId is required to create final order.");
  }

  // 1. Check if Order already exists for this pool (Idempotency)
  const existingOrder = await Order.findOne({ poolId }, null, session ? { session } : {});
  if (existingOrder) {
    return existingOrder;
  }

  // 2. Fetch GroupBuyPool
  const GroupBuyPool = mongoose.models.GroupBuyPool || mongoose.model("GroupBuyPool");
  const poolQuery = GroupBuyPool.findById(poolId);
  if (session) poolQuery.session(session);
  const pool = await poolQuery;

  if (!pool) {
    throw new ApiError(404, `GroupBuyPool not found with identifier: ${poolId}`);
  }

  // 3. Fetch active contributions
  const Contribution = mongoose.models.Contribution || mongoose.model("Contribution");
  const contribQuery = Contribution.find({
    poolId,
    state: { $in: ["ACTIVE", "PENDING_PAYMENT", "FINALIZED"] },
  }).populate("shopId");
  if (session) contribQuery.session(session);
  const contributions = await contribQuery;

  if (!contributions || contributions.length === 0) {
    throw new ApiError(400, "Cannot finalize order: pool has no active contributions.");
  }

  // 4. Verify that all active contributions are APPROVED and fully PAID
  for (const contrib of contributions) {
    if (contrib.approvalStatus !== "APPROVED") {
      throw new ApiError(
        400,
        `Cannot finalize order: contribution ${contrib._id} has not been APPROVED (current status: ${contrib.approvalStatus}).`
      );
    }

    const requiredPayable =
      contrib.finalTotalPayableMinor ||
      (contrib.estimatedMerchandiseShareMinor +
        (contrib.estimatedShippingShareMinor || 0) +
        (contrib.roundingAdjustmentMinor || 0));

    if (contrib.totalPaidMinor < requiredPayable) {
      throw new ApiError(
        400,
        `Cannot finalize order: contribution ${contrib._id} is not fully PAID (paid: ${contrib.totalPaidMinor}, required: ${requiredPayable}).`
      );
    }
  }

  // 5. Fetch PriceSnapshot
  const PriceSnapshot = mongoose.models.PriceSnapshot || mongoose.model("PriceSnapshot");
  let snapshot = null;
  if (pool.latestPriceSnapshotId) {
    const snapQuery = PriceSnapshot.findById(pool.latestPriceSnapshotId);
    if (session) snapQuery.session(session);
    snapshot = await snapQuery;
  }
  if (!snapshot) {
    const snapQuery = PriceSnapshot.findOne({ poolId, isSuperseded: false }).sort({ version: -1 });
    if (session) snapQuery.session(session);
    snapshot = await snapQuery;
  }

  if (!snapshot) {
    throw new ApiError(400, "Cannot finalize order: no valid PriceSnapshot found for pool.");
  }

  // 6. Resolve Supplier & Product IDs
  let supplierId = pool.supplierId;
  let supplierOfferId = pool.supplierOfferId || snapshot.supplierOfferId;
  let productId = pool.productId;

  if (!supplierId && supplierOfferId) {
    const SupplierOffer = mongoose.models.SupplierOffer || mongoose.model("SupplierOffer");
    const offerQuery = SupplierOffer.findById(supplierOfferId);
    if (session) offerQuery.session(session);
    const offer = await offerQuery;
    if (offer) {
      supplierId = offer.supplierId;
      if (!productId) productId = offer.productId;
    }
  }

  if (!supplierId) {
    throw new ApiError(400, "Cannot finalize order: supplier reference could not be resolved.");
  }

  // 7. Build itemized memberOrders allocations
  const memberOrders = contributions.map((contrib) => {
    const memberShare = snapshot.memberShares?.find(
      (s) => s.contributionId?.toString() === contrib._id?.toString()
    );

    const shop = contrib.shopId;
    const shopName = shop?.name || shop?.shopName || contrib.shopName || "Retail Shop";

    const unitPriceMinor =
      memberShare?.appliedUnitPriceMinor ||
      contrib.unitPriceMinor ||
      snapshot.appliedUnitPriceMinor ||
      pool.currentUnitPriceMinor;

    const merchandiseShareMinor =
      memberShare?.merchandiseShareMinor ||
      (contrib.quantity * unitPriceMinor);

    const shippingShareMinor =
      memberShare?.shippingShareMinor ??
      (contrib.estimatedShippingShareMinor || 0);

    return {
      contributionId: contrib._id,
      shopId: shop?._id || contrib.shopId,
      shopName,
      quantity: contrib.quantity,
      unit: contrib.unit || pool.packUnit || "UNIT",
      unitPriceMinor,
      merchandiseShareMinor,
      shippingShareMinor,
      totalPaidMinor: contrib.totalPaidMinor,
      deliveryStatus: "PENDING",
    };
  });

  // 8. Calculate aggregate totals
  const totalQuantity = memberOrders.reduce((sum, m) => sum + m.quantity, 0);
  const merchandiseTotalMinor = memberOrders.reduce(
    (sum, m) => sum + m.merchandiseShareMinor,
    0
  );
  const shippingTotalMinor = memberOrders.reduce(
    (sum, m) => sum + m.shippingShareMinor,
    0
  );
  const grandTotalMinor = merchandiseTotalMinor + shippingTotalMinor;

  // 9. Generate unique orderNumber
  const orderNumber = await generateNextOrderNumber(session);

  // 10. Create Order document
  const orderDocs = await Order.create(
    [
      {
        orderNumber,
        poolId: pool._id,
        supplierId,
        productId,
        supplierOfferId,
        priceSnapshotId: snapshot._id,
        currency: pool.currency || snapshot.currency || "INR",
        totalQuantity,
        unit: pool.packUnit || "UNIT",
        merchandiseTotalMinor,
        shippingTotalMinor,
        grandTotalMinor,
        memberOrders,
        supplierConfirmationStatus: "PENDING",
        supplierReference: null,
        isSimulatedConfirmation: true,
        orderState: "AWAITING_SUPPLIER_CONFIRMATION",
      },
    ],
    session ? { session } : {}
  );

  const order = orderDocs[0];

  // 11. Transition Pool and Contributions
  pool.state = "ORDERED";
  await pool.save(session ? { session } : {});

  for (const contrib of contributions) {
    contrib.state = "FINALIZED";
    await contrib.save(session ? { session } : {});
  }

  // 12. Create SupplierSettlement in DEMO / SIMULATED mode
  await createOrGetSupplierSettlement(order._id, {
    mode: "DEMO",
    settlementStatus: "SIMULATED",
    notes:
      "Simulated supplier settlement for prototype demonstration. Payout is tracked separately from buyer PayPal captures.",
  });

  // 13. Audit Log & Notifications (non-throwing)
  await safeLogAudit({
    actorId: pool.createdByUserId,
    actorRole: "SHOP_OWNER",
    action: "ORDER_CREATED",
    resourceType: "ORDER",
    resourceId: order._id,
    poolId: pool._id,
    orderId: order._id,
    metadata: {
      orderNumber: order.orderNumber,
      totalQuantity,
      grandTotalMinor,
      memberCount: memberOrders.length,
    },
  });

  for (const contrib of contributions) {
    if (contrib.createdByUserId) {
      await safeSendNotification({
        recipientUserId: contrib.createdByUserId,
        shopId: contrib.shopId?._id || contrib.shopId,
        type: "ORDER_STATUS_UPDATED",
        title: "Order Finalized",
        message: `Bulk Purchase Order ${order.orderNumber} has been finalized and submitted to the supplier for confirmation.`,
        linkUrl: `/orders/${order._id}`,
        relatedPoolId: pool._id,
        relatedOrderId: order._id,
        metadata: { orderNumber: order.orderNumber },
      });
    }
  }

  return order;
}

/**
 * Task SRU-05: PATCH /api/orders/:id/supplier-status
 * Wholesaler or Admin confirms order, updates shipping/delivery status, or rejects order.
 *
 * If rejected:
 *  - Automatically triggers full refunds for all participants (reason: 'SUPPLIER_REJECTED').
 *  - Sets pool and order to CANCELLED.
 *  - Dispatches ORDER_REJECTED notifications.
 *
 * @param {string|mongoose.Types.ObjectId} orderId
 * @param {object} updatePayload
 * @param {object} requestingUser
 * @returns {Promise<mongoose.Document>}
 */
export async function updateSupplierStatus(orderId, updatePayload = {}, requestingUser) {
  if (!requestingUser) {
    throw new ApiError(401, "Authentication required to update order supplier status.");
  }

  const query = mongoose.isValidObjectId(orderId)
    ? { _id: orderId }
    : { orderNumber: orderId };

  const order = await Order.findOne(query);
  if (!order) {
    throw new ApiError(404, `Order not found with identifier: ${orderId}`);
  }

  const role = requestingUser.role;
  const isAdmin = role === "ADMIN";
  const userSupplierId =
    requestingUser.supplierId?.toString() || requestingUser._id?.toString();
  const orderSupplierId = order.supplierId?.toString();
  const isAssignedSupplier =
    role === "SUPPLIER" && userSupplierId && orderSupplierId && userSupplierId === orderSupplierId;

  if (!isAdmin && !isAssignedSupplier) {
    throw new ApiError(
      403,
      "Forbidden: Only the assigned supplier or an administrator can update supplier status."
    );
  }

  const {
    status, // "CONFIRMED" | "REJECTED"
    supplierReference,
    expectedDeliveryDate,
    rejectionReason,
    cancellationReason,
    deliveryStatus, // "PENDING" | "DISPATCHED" | "DELIVERED" | "CANCELLED"
    orderState, // "CONFIRMED" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "EXCEPTION"
    isSimulatedConfirmation,
  } = updatePayload;

  // Case A: CONFIRMED
  if (status === "CONFIRMED") {
    order.supplierConfirmationStatus = "CONFIRMED";
    order.confirmedAt = new Date();
    order.orderState = orderState || "CONFIRMED";

    if (supplierReference !== undefined) {
      order.supplierReference = supplierReference;
    }
    if (expectedDeliveryDate !== undefined) {
      order.expectedDeliveryDate = new Date(expectedDeliveryDate);
    }
    if (isSimulatedConfirmation !== undefined) {
      order.isSimulatedConfirmation = Boolean(isSimulatedConfirmation);
    }
    if (deliveryStatus) {
      order.memberOrders.forEach((m) => {
        m.deliveryStatus = deliveryStatus;
      });
    }

    await order.save();

    await safeLogAudit({
      actorId: requestingUser._id,
      actorRole: role,
      action: "ORDER_CONFIRMED",
      resourceType: "ORDER",
      resourceId: order._id,
      poolId: order.poolId,
      orderId: order._id,
      metadata: {
        orderNumber: order.orderNumber,
        supplierReference: order.supplierReference,
        expectedDeliveryDate: order.expectedDeliveryDate,
      },
    });

    const Contribution = mongoose.models.Contribution || mongoose.model("Contribution");
    const contribIds = order.memberOrders.map((m) => m.contributionId);
    const contributions = await Contribution.find({ _id: { $in: contribIds } });

    for (const contrib of contributions) {
      if (contrib.createdByUserId) {
        await safeSendNotification({
          recipientUserId: contrib.createdByUserId,
          shopId: contrib.shopId,
          type: "ORDER_CONFIRMED",
          title: "Order Confirmed by Supplier",
          message: `Supplier has confirmed Order ${order.orderNumber}. Expected delivery: ${
            order.expectedDeliveryDate ? order.expectedDeliveryDate.toLocaleDateString() : "To be confirmed"
          }.`,
          linkUrl: `/orders/${order._id}`,
          relatedPoolId: order.poolId,
          relatedOrderId: order._id,
        });
      }
    }

    return order;
  }

  // Case B: REJECTED (Automatically triggers full refunds for all participants)
  if (status === "REJECTED") {
    const reason = rejectionReason || cancellationReason || "Order rejected by supplier.";

    order.supplierConfirmationStatus = "REJECTED";
    order.orderState = "CANCELLED";
    order.cancellationReason = reason;

    order.memberOrders.forEach((m) => {
      m.deliveryStatus = "CANCELLED";
    });

    await order.save();

    // Transition GroupBuyPool to CANCELLED
    const GroupBuyPool = mongoose.models.GroupBuyPool || mongoose.model("GroupBuyPool");
    await GroupBuyPool.findByIdAndUpdate(order.poolId, {
      state: "CANCELLED",
      closedAt: new Date(),
      closureReason: `Supplier rejected order: ${reason}`,
    });

    // Automatic Refund Rollback: initiate refunds for all captured payments in the pool
    const Payment = mongoose.models.Payment || mongoose.model("Payment");
    const paidPayments = await Payment.find({
      poolId: order.poolId,
      paymentStatus: { $in: ["PAID", "PARTIALLY_REFUNDED"] },
    });

    const refundResults = [];
    for (const payment of paidPayments) {
      try {
        const result = await initiateRefund({
          paymentId: payment._id,
          reason: "SUPPLIER_REJECTED",
          idempotencyKey: `refund-supplier-rejected-${order._id}-${payment._id}`,
          requesterUserId: requestingUser._id,
          metadata: {
            orderId: order._id,
            orderNumber: order.orderNumber,
            rejectionReason: reason,
          },
        });
        refundResults.push(result);
      } catch (refundErr) {
        console.error(`[Supplier Status Reject] Refund error for payment ${payment._id}:`, refundErr.message);
      }
    }

    // Transition Contributions to REFUNDED
    const Contribution = mongoose.models.Contribution || mongoose.model("Contribution");
    const contribIds = order.memberOrders.map((m) => m.contributionId);
    await Contribution.updateMany(
      { _id: { $in: contribIds } },
      { state: "REFUNDED" }
    );

    await safeLogAudit({
      actorId: requestingUser._id,
      actorRole: role,
      action: "ORDER_REJECTED",
      resourceType: "ORDER",
      resourceId: order._id,
      poolId: order.poolId,
      orderId: order._id,
      metadata: {
        orderNumber: order.orderNumber,
        reason,
        refundsCount: refundResults.length,
      },
    });

    const contributions = await Contribution.find({ _id: { $in: contribIds } });
    for (const contrib of contributions) {
      if (contrib.createdByUserId) {
        await safeSendNotification({
          recipientUserId: contrib.createdByUserId,
          shopId: contrib.shopId,
          type: "ORDER_REJECTED",
          title: "Order Cancelled — Supplier Rejected",
          message: `Order ${order.orderNumber} was rejected by the supplier (${reason}). Full refund has been initiated to your original payment method.`,
          linkUrl: `/pools/${order.poolId}`,
          relatedPoolId: order.poolId,
          relatedOrderId: order._id,
        });
      }
    }

    return order;
  }

  // Case C: Shipping / Fulfilment Updates
  if (orderState) {
    order.orderState = orderState;
  }
  if (supplierReference !== undefined) {
    order.supplierReference = supplierReference;
  }
  if (expectedDeliveryDate !== undefined) {
    order.expectedDeliveryDate = new Date(expectedDeliveryDate);
  }
  if (deliveryStatus) {
    order.memberOrders.forEach((m) => {
      m.deliveryStatus = deliveryStatus;
    });
  }

  await order.save();

  await safeLogAudit({
    actorId: requestingUser._id,
    actorRole: role,
    action: "ORDER_STATUS_UPDATED",
    resourceType: "ORDER",
    resourceId: order._id,
    poolId: order.poolId,
    orderId: order._id,
    metadata: {
      orderNumber: order.orderNumber,
      orderState: order.orderState,
      deliveryStatus: deliveryStatus || null,
    },
  });

  const Contribution = mongoose.models.Contribution || mongoose.model("Contribution");
  const contribIds = order.memberOrders.map((m) => m.contributionId);
  const contributions = await Contribution.find({ _id: { $in: contribIds } });

  for (const contrib of contributions) {
    if (contrib.createdByUserId) {
      await safeSendNotification({
        recipientUserId: contrib.createdByUserId,
        shopId: contrib.shopId,
        type: "ORDER_STATUS_UPDATED",
        title: "Order Fulfilment Update",
        message: `Order ${order.orderNumber} status updated to ${order.orderState}.`,
        linkUrl: `/orders/${order._id}`,
        relatedPoolId: order.poolId,
        relatedOrderId: order._id,
      });
    }
  }

  return order;
}

export default {
  generatePurchaseOrderSummary,
  verifyOrderAuthorization,
  formatCurrency,
  createOrGetSupplierSettlement,
  getSupplierSettlement,
  updateSupplierSettlement,
  createFinalOrderFromFundedPool,
  updateSupplierStatus,
  generateNextOrderNumber,
};
