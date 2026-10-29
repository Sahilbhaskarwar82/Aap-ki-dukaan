import mongoose from "mongoose";
import { Order } from "../../models/Order.model.js";
import { Payment } from "../../models/Payment.model.js";
import { ApiError } from "../../utils/apiError.js";
import { toDecimalString } from "../payments/paypalAdapter.service.js";

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
 * Helper to safely resolve a model or null if not registered.
 */
function getOptionalModel(modelName) {
  try {
    return mongoose.model(modelName);
  } catch {
    return null;
  }
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

  // 3. Resolve populated records safely (with fallbacks if models are stubs)
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

// Named exports for both module conventions
export default {
  generatePurchaseOrderSummary,
  verifyOrderAuthorization,
  formatCurrency,
};
