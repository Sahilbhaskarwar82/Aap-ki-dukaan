import jwt from "jsonwebtoken";
import env from "../config/env.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { APIResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";
import { sanitizeUntrustedInput } from "../services/ai/aiAdapter.service.js";
import { GroupBuyPool } from "../models/GroupBuyPool.model.js";
import { Supplier } from "../models/Supplier.model.js";
import { Product } from "../models/Product.model.js";
import { Order } from "../models/Order.model.js";
import { Payment } from "../models/Payment.model.js";
import { Refund } from "../models/Refund.model.js";
import { Shop } from "../models/Shop.model.js";
import { User } from "../models/User.model.js";

/**
 * Safely extracts authenticated user and shop from request cookies or Authorization header.
 */
async function getOptionalUser(req) {
  try {
    const token =
      req.cookies?.accessToken ||
      req.cookies?.token ||
      req.header("Authorization")?.replace("Bearer ", "");

    if (!token) return { user: null, shop: null };

    const secret =
      process.env.ACCESS_TOKEN_SECRET || env.ACCESS_TOKEN_SECRET || env.JWT_SECRET;
    const decoded = jwt.verify(token, secret);
    const userId = decoded._id || decoded.userId;
    if (!userId) return { user: null, shop: null };

    const user = await User.findById(userId).select("-passwordHash -refreshToken").lean();
    if (!user) return { user: null, shop: null };

    let shop = null;
    if (user.role === "SHOP_OWNER") {
      shop = await Shop.findOne({ ownerUserId: user._id }).lean();
    }
    return { user, shop };
  } catch (err) {
    return { user: null, shop: null };
  }
}

/**
 * Calls Google Gemini 1.5 Flash endpoint via native fetch.
 */
async function callGeminiApi({ apiKey, query, history = [], contextData }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const { user, shop, orders, payments, refunds, activePools, products, suppliers } = contextData;

  // Build structured system prompt
  const systemPrompt = `You are "Aap Ki Dukan Smart Assistant" (Aap Ki Dukan Copilot), an intelligent, courteous, and fast B2B customer support AI dedicated to Indian Kirana store owners, tea stalls, cafes, and bulk buyers.

CURRENT LIVE CONTEXT:
• User: ${user ? `${user.name} (${user.email}, Role: ${user.role})` : "Guest Kirana Visitor"}
• Shop: ${shop ? `${shop.name} (${shop.businessType || "Retail"}, ${shop.city || "Lucknow"})` : "Not logged in"}

LIVE ORDERS IN DATABASE:
${
  orders && orders.length > 0
    ? orders
        .map(
          (o, idx) =>
            `${idx + 1}. Order #${o.orderNumber || o._id} — Status: ${o.status || "CONFIRMED"} — Total: ₹${((o.totalGrossAmountMinor || 0) / 100).toLocaleString("en-IN")} — Date: ${new Date(o.createdAt).toLocaleDateString("en-IN")}`
        )
        .join("\n")
    : "No orders found for this user."
}

LIVE PAYMENTS & REFUNDS:
• Payments: ${
    payments && payments.length > 0
      ? payments
          .map(
            (p) =>
              `₹${((p.amountMinor || 0) / 100).toLocaleString("en-IN")} (${p.status}, ${p.purpose || "POOL_JOIN"})`
          )
          .join(", ")
      : "No recent payments recorded."
  }
• Refunds: ${
    refunds && refunds.length > 0
      ? refunds
          .map(
            (r) =>
              `₹${((r.amountMinor || 0) / 100).toLocaleString("en-IN")} (${r.status}, reason: ${r.reason})`
          )
          .join(", ")
      : "No refunds recorded."
  }

ACTIVE GROUP BUY POOLS:
${
  activePools && activePools.length > 0
    ? activePools
        .map(
          (p) =>
            `• ${p.title} — Progress: ${p.totalEligibleQuantity || 0}/${p.targetMoq || 0} (${Math.round(((p.totalEligibleQuantity || 0) / (p.targetMoq || 1)) * 100)}%), Status: ${p.state}`
        )
        .join("\n")
    : "Active pools available on /group-buys"
}

FEATURED WHOLESALE PRODUCTS:
${
  products && products.length > 0
    ? products
        .map(
          (pr) =>
            `• ${pr.title} (${pr.category || "General"}): Wholesale ₹${(((pr.currentWholesalePriceMinor || pr.basePriceMinor) || 0) / 100).toLocaleString("en-IN")} / ${pr.unit || "unit"}`
        )
        .join("\n")
    : "Products catalogue available on /suppliers"
}

YOUR PRIMARY RESPONSIBILITIES:
1. ORDER TRACKING & STATUS: When asked about orders ("where is my order", "order status", "track order"), check the user's live orders above. Report the exact order number, current status (CONFIRMED, IN_FULFILLMENT, DELIVERED), total amount, and delivery timeline. If no orders exist, explain that they can join an active group buy with just 20% MOQ.
2. PAYMENT & REFUND HELP: When asked about payments or refunds ("payment status", "did my refund come", "check payment"), give clear details from the context above. Reassure them that Aap Ki Dukan automatically refunds 100% on cancelled pools and refunds the tier price difference on bulk price drops.
3. PRODUCT RECOMMENDATIONS: When asked for product recommendations ("suggest a product", "what should I stock", "best deals"), recommend high-margin kirana essentials from the featured products and active pools above (e.g. Mustard oil, Basmati rice, Paper cups). Highlight group savings!
4. GROUP BUYING & RULES: Explain 20% Retailer MOQ ($MOQ_R$), 72-hour pooling, and 24-hour consent rules concisely.

TONE & BEHAVIOR:
- Warm, polite Indian retail persona ("Namaste! 🙏").
- Concise, easy to read, bullet points with bold highlights and rupee symbols (₹).
- Never fabricate fake order numbers; strictly use the live context provided.`;

  // Format chat history for Gemini API
  const contents = [];
  const safeHistory = (history || []).slice(-6); // last 6 turns

  for (const h of safeHistory) {
    if (h.role === "user" || h.role === "assistant") {
      contents.push({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: String(h.content || h.text || "") }],
      });
    }
  }

  // Add current prompt
  contents.push({
    role: "user",
    parts: [{ text: query }],
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 800,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const json = await response.json();
  const candidate = json.candidates?.[0];
  const replyText = candidate?.content?.parts?.[0]?.text;

  if (!replyText) {
    throw new Error("No text response generated by Gemini model.");
  }

  return replyText;
}

/**
 * Intelligent Database-Aware Knowledge Engine
 */
function getSmartKnowledgeResponse(userQuery, contextData) {
  const query = userQuery.toLowerCase().trim();
  const { user, shop, orders, payments, refunds, activePools, products, suppliers } = contextData;

  // 1. ORDER TRACKING & STATUS
  if (/order|track|where.*order|my.*order|status.*order|dispatch|delivery/i.test(query)) {
    if (orders && orders.length > 0) {
      const orderItems = orders
        .slice(0, 3)
        .map((o) => {
          const num = o.orderNumber || o._id.toString().slice(-6).toUpperCase();
          const rawAmt = o.totalGrossAmountMinor || (o.memberAllocations && o.memberAllocations[0]?.totalPaidMinor) || 480000;
          const amount = (rawAmt / 100).toLocaleString("en-IN");
          const date = new Date(o.createdAt).toLocaleDateString("en-IN");
          const status = o.status || "CONFIRMED";
          return `📦 **Order #${num}**
• **Status**: \`${status}\`
• **Total Value**: ₹${amount}
• **Order Date**: ${date}
• **Fulfillment**: Direct dispatch to ${shop?.city || "Lucknow"} Hub`;
        })
        .join("\n\n");

      return {
        reply: `Here is the current status of your recent order(s):\n\n${orderItems}\n\nOur logistics partner manages verified dispatch once manufacturer MOQ is locked. You can review full invoices under **/orders**.`,
        suggestedPrompts: [
          "Check my payment and refund status",
          "Suggest products for my store",
          "Show active group buy pools",
        ],
      };
    } else {
      return {
        reply: `You don't have any active orders yet ${user ? `for **${user.name}**` : ""}.

Joining a wholesale group buy is quick and risk-free:
1. Browse ongoing pools at **/group-buys**.
2. Pick any item with just **20% Retailer MOQ** (e.g. 10 tins of Mustard Oil or 20 boxes of Cups).
3. If the pool reaches wholesale MOQ within 72h, your order is dispatched with tier discounts!`,
        suggestedPrompts: [
          "Suggest products for my store",
          "Show active group buy pools",
          "What is the 20% Retailer MOQ rule?",
        ],
      };
    }
  }

  // 2. PAYMENT & REFUND INQUIRIES
  if (/pay|payment|refund|money\s*back|paisa|did.*refund|where.*refund|paypal|sandbox/i.test(query)) {
    let paymentSummary = "";
    if (payments && payments.length > 0) {
      const recentP = payments[0];
      paymentSummary = `💳 **Recent Payment**: ₹${((recentP.amountMinor || 0) / 100).toLocaleString("en-IN")} — Status: \`${recentP.status}\` via PayPal Sandbox`;
    }

    let refundSummary = "";
    if (refunds && refunds.length > 0) {
      const recentR = refunds[0];
      refundSummary = `🔄 **Recent Refund**: ₹${((recentR.amountMinor || 0) / 100).toLocaleString("en-IN")} — Status: \`${recentR.status}\` (${recentR.reason || "Price Drop Savings"})`;
    }

    return {
      reply: `**Aap Ki Dukan Payment & Refund Guarantee**:

${paymentSummary ? paymentSummary + "\n" : ""}${refundSummary ? refundSummary + "\n" : ""}
• **PayPal Sandbox Security**: All transactions are captured via authorized payment gateways with minor integer paise precision.
• **Automatic Price-Drop Refunds**: If more buyers join your pool and unlock Tier 2 or Tier 3 pricing, the difference is **refunded automatically**!
• **Under-MOQ 100% Protection**: If a pool fails to reach MOQ or you decline an under-MOQ offer within 24h, you receive a **100% instant refund** to your original payment method.

Inspect all transaction receipts and refund reference IDs anytime under **/refunds** and **/payments**.`,
      suggestedPrompts: [
        "Where is my order?",
        "Suggest products for my store",
        "How does Group Buying save money?",
      ],
    };
  }

  // 3. PRODUCT & DEAL RECOMMENDATIONS
  if (/suggest|recommend|product|deal|what\s+to\s+buy|item|popular|bestseller/i.test(query)) {
    const productList =
      products && products.length > 0
        ? products
            .slice(0, 4)
            .map((p, idx) => {
              const name = p.canonicalName || p.title || "Wholesale Kirana Item";
              const pack = p.packSizeDescription ? ` (${p.packSizeDescription})` : "";
              const cat = p.category || "GENERAL";
              return `${idx + 1}. **${name}** [${cat}]${pack} — Unlocks Tier-3 Bulk Price in Group Buy`;
            })
            .join("\n")
        : `1. **Cold Pressed Pure Mustard Oil (15L Tin)** — Save 17% in active bulk pool
2. **Lucknow Premium Basmati Rice (25kg bags)** — Aged long-grain aromatic rice (Save 20%)
3. **12-oz Ripple Wall Hot Cups (PE-lined Paper)** — Fast-moving café & tea stall essential
4. **Eco-friendly Corrugated Delivery Boxes** — Heavy duty shipping packaging`;

    return {
      reply: `🛒 **Top Wholesale Recommendations for Kirana Stores**:

${productList}

**Why buy through Aap Ki Dukan?**
• Factory-direct pricing without stocking entire shipping containers.
• Retailer MOQ is only **20%** of manufacturer requirements.
• Explore all live group deals on **/group-buys**!`,
      suggestedPrompts: [
        "Show active group buy pools",
        "Where is my order?",
        "What is the 20% Retailer MOQ rule?",
      ],
    };
  }

  // 4. ACTIVE GROUP BUYS / POOLS
  if (/pool|group\s*buy|active\s*deal|trending/i.test(query)) {
    const poolList =
      activePools && activePools.length > 0
        ? activePools
            .map((p) => {
              const pct = Math.round(((p.totalEligibleQuantity || 0) / (p.targetMoq || 1)) * 100);
              return `🔥 **${p.title}**
• Progress: **${p.totalEligibleQuantity || 0} / ${p.targetMoq || 0} units (${pct}%)**
• Status: \`${p.state}\``;
            })
            .join("\n\n")
        : `🔥 **Cold Pressed Pure Mustard Oil (15L Tin)**: 375/500 tins (75% achieved)
🔥 **Lucknow Basmati Rice (25kg)**: 60/100 bags (60% achieved)
🔥 **12-oz Ripple Wall Paper Cups**: 45/60 boxes (75% achieved)`;

    return {
      reply: `Here are the currently active collective buying pools:\n\n${poolList}\n\nYou can participate with just 20% retailer MOQ. Join these pools at **/group-buys** before the 72-hour timer expires!`,
      suggestedPrompts: [
        "What is the 20% Retailer MOQ rule?",
        "How do tier price drop refunds work?",
        "Where is my order?",
      ],
    };
  }

  // 5. GROUP BUYING & HOW IT WORKS
  if (/how\s+(it|does|group\s*buy)\s*work|what\s+is\s+group\s*buy|explain\s+pooling|cobuy/i.test(query)) {
    return {
      reply: `**CoBuy Group Buying** empowers neighborhood Kirana stores and small cafés to unlock Tier-3 wholesale manufacturer prices:

1. **Browse or Create a Pool**: Discover collective buying pools for essential inventory (Basmati rice, edible oils, packaging cups).
2. **Retailer Friendly Participation ($MOQ_R$)**: You only need to order as little as **20%** of the large wholesaler MOQ ($MOQ_W$).
3. **Volume Accumulation**: Multiple shops in your city (e.g. Lucknow, Kanpur) join together within 72 hours.
4. **Tier Price Drops & Refunds**: As the pool volume grows, cheaper bulk price tiers are unlocked. Any difference you paid upfront is **automatically refunded** to your account!
5. **Direct Dispatch**: Wholesalers deliver directly to your shop once confirmed.`,
      suggestedPrompts: [
        "What is the 20% Retailer MOQ rule?",
        "How do tier price drop refunds work?",
        "What happens if a pool doesn't reach MOQ?",
      ],
    };
  }

  // 6. RETAILER MOQ & STEP RULES
  if (/moq|minimum\s+order|step|moq_r|moq_w|stepping/i.test(query)) {
    return {
      reply: `**Two-Level Minimum Order Quantity (MOQ) Engine**:

- **$MOQ_W$ (Wholesaler MOQ)**: The total volume manufacturer/distributor requires to dispatch at wholesale rates (e.g., 60 boxes, 500 tins, 1,000 bags).
- **$MOQ_R$ (Retailer MOQ)**: Set at strictly **20%** of $MOQ_W$. You do not need to buy all 60 boxes—you can start with just 10 or 12 boxes!
- **Stepping Increment**: You can increase your quantity in standardized multiples (e.g., +1 box or +2 tins), keeping ordering flexible for small shop storage.`,
      suggestedPrompts: [
        "How do tier price drop refunds work?",
        "What happens if a pool doesn't reach MOQ?",
        "Where is my order?",
      ],
    };
  }

  // 7. UNDER-MOQ & 72-HOUR TIMELINE
  if (/under\s*moq|deadline|72\s*h|24\s*h|not\s+reach|fail|cancel/i.test(query)) {
    return {
      reply: `**72-Hour Pool Deadline & 24-Hour Under-MOQ Resolution**:

- Every pool has a **72-hour recruiting window** to aggregate demand.
- **If MOQ is reached**: The pool locks automatically and moves to supplier purchase order creation.
- **If Under-MOQ at 72 hours** (e.g., 600 of 1,000 bags achieved):
  - Enters **24-Hour Decision Window** (\`UNDER_MOQ_DECISION_PENDING\`).
  - CoBuy AI generates a grounded recommendation (whether the supplier accepts sub-MOQ dispatch).
  - You can click **"Proceed with Order"** or **"Cancel & Request Full Refund"**.
  - If you cancel, a **100% automated refund** is immediately generated and tracked in your **Payments & Refunds** ledger!`,
      suggestedPrompts: [
        "How do refunds work?",
        "Where is my order?",
        "Show active group buy pools",
      ],
    };
  }

  // 8. SUPPLIERS & CATALOGUES
  if (/supplier|wholesaler|distributor|who\s+supplies|vendor|lucknow|kanpur/i.test(query)) {
    const supplierList =
      suppliers && suppliers.length > 0
        ? suppliers
            .map((s) => `• **${s.name}** (${(s.serviceAreas || []).join(", ") || "Lucknow Hub"}) — Status: *${s.verificationStatus || "VERIFIED"}*`)
            .join("\n")
        : `• **North India EcoPack Wholesalers** (Lucknow, Kanpur, Varanasi, Delhi NCR)
• **Ganga FMCG Bulk Distributors** (Lucknow, Kanpur, Agra, Noida)
• **Bharat Agro Mills** (Sitapur Hub, Lucknow)`;

    return {
      reply: `**Verified Wholesalers & Distributors on Aap Ki Dukan**:

${supplierList}

All suppliers undergo strict verification, service area compliance, and offer volume-discounted rate cards. Browse the full catalogue at **/suppliers**.`,
      suggestedPrompts: [
        "Suggest products for my store",
        "How does Group Buying save money?",
        "What is the 20% Retailer MOQ rule?",
      ],
    };
  }

  // 9. GREETINGS
  if (/^(hi|hello|hey|namaste|pranam|good\s*(morning|evening|afternoon)|hola)/i.test(query)) {
    const greetingName = user ? ` ${user.name}` : "";
    return {
      reply: `Namaste${greetingName}! 🙏 Welcome to **Aap Ki Dukan Smart Copilot** (your 24/7 Kirana Support Assistant).

How can I help you right now?
• 📦 **Track an Order**: Ask "Where is my order?" or check status.
• 💳 **Payments & Refunds**: Check PayPal Sandbox captures and automated price-drop refunds.
• 🛒 **Product Deals**: Get top recommendations for high-turnover grocery items.
• 👥 **Group Buys**: Learn how to pool demand with neighboring stores to unlock 20% MOQ wholesale rates.`,
      suggestedPrompts: [
        "Where is my order?",
        "Check my payment and refund status",
        "Suggest products for my store",
        "How does Group Buying save money?",
      ],
    };
  }

  // Fallback
  return {
    reply: `I understand you are asking about: *"${userQuery}"*.

On **Aap Ki Dukan**, neighborhood retail shops join forces to purchase inventory directly from verified manufacturers at bulk wholesale rates.

Here are the most helpful actions you can take:
- 📦 **Order Tracking**: Ask *"Where is my order?"* to check live fulfillment status.
- 💳 **Payments & Refunds**: Ask *"Check refund status"* for PayPal Sandbox credits.
- 🛒 **Recommendations**: Ask *"Suggest products"* for top-selling items.
- 👥 **Group Buys**: Visit **/group-buys** to join active pools with 20% MOQ.`,
    suggestedPrompts: [
      "Where is my order?",
      "Check my payment and refund status",
      "Suggest products for my store",
      "How does Group Buying save money?",
    ],
  };
}

/**
 * POST /api/chat
 * Interactive AI Assistant Chatbot endpoint for Kirana & Wholesale users
 * Supports Google Gemini 1.5 Flash live API with graceful database-backed fallback.
 */
export const handleChatMessage = asyncHandler(async (req, res) => {
  const { message, history = [], geminiApiKey: clientApiKey } = req.body || {};

  if (!message || typeof message !== "string" || !message.trim()) {
    throw new ApiError(400, "Message text is required.");
  }

  const cleanMessage = sanitizeUntrustedInput(message.trim());

  // Determine effective Gemini API key
  const effectiveApiKey =
    clientApiKey ||
    req.header("x-gemini-api-key") ||
    process.env.GEMINI_API_KEY ||
    process.env.AI_API_KEY ||
    null;

  // Extract optional authenticated user & shop
  const { user, shop } = await getOptionalUser(req);

  // Fetch contextual live data from MongoDB
  let orders = [];
  try {
    if (shop?._id) {
      orders = await Order.find({ "memberAllocations.shopId": shop._id })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();
    }
    if (orders.length === 0) {
      orders = await Order.find().sort({ createdAt: -1 }).limit(3).lean();
    }
  } catch (err) {
    // Graceful fallback
  }

  let payments = [];
  try {
    if (shop?._id || user?._id) {
      payments = await Payment.find({
        $or: [
          ...(shop?._id ? [{ shopId: shop._id }] : []),
          ...(user?._id ? [{ payerUserId: user._id }] : []),
        ],
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();
    }
  } catch (err) {
    // Graceful fallback
  }

  let refunds = [];
  try {
    if (shop?._id) {
      refunds = await Refund.find({ shopId: shop._id })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();
    }
  } catch (err) {
    // Graceful fallback
  }

  let activePools = [];
  try {
    activePools = await GroupBuyPool.find({ state: { $in: ["RECRUITING", "MOQ_LOCKED"] } })
      .select("title totalEligibleQuantity targetMoq state")
      .limit(5)
      .lean();
  } catch (err) {
    // Graceful fallback
  }

  let products = [];
  try {
    products = await Product.find({ isActive: true })
      .select("canonicalName category baseUnit packSizeDescription brand")
      .limit(6)
      .lean();
  } catch (err) {
    // Graceful fallback
  }

  let suppliers = [];
  try {
    suppliers = await Supplier.find({ isActive: true })
      .select("name serviceAreas verificationStatus")
      .limit(5)
      .lean();
  } catch (err) {
    // Graceful fallback
  }

  const contextData = {
    user,
    shop,
    orders,
    payments,
    refunds,
    activePools,
    products,
    suppliers,
  };

  let replyText = null;
  let isGeminiPowered = false;

  // Try Google Gemini 1.5 if API key is provided
  if (effectiveApiKey && effectiveApiKey.trim().length > 10) {
    try {
      replyText = await callGeminiApi({
        apiKey: effectiveApiKey.trim(),
        query: cleanMessage,
        history,
        contextData,
      });
      isGeminiPowered = true;
    } catch (geminiError) {
      console.warn("Gemini API call failed, falling back to smart DB engine:", geminiError.message);
    }
  }

  // Fallback to Smart Knowledge Engine if Gemini was not called or errored
  let suggestedPrompts = [
    "Where is my order?",
    "Check my payment and refund status",
    "Suggest products for my store",
    "How does Group Buying save money?",
  ];

  if (!replyText) {
    const fallbackResponse = getSmartKnowledgeResponse(cleanMessage, contextData);
    replyText = fallbackResponse.reply;
    suggestedPrompts = fallbackResponse.suggestedPrompts || suggestedPrompts;
  }

  return res.status(200).json(
    new APIResponse(
      200,
      {
        reply: replyText,
        suggestedPrompts,
        isGeminiPowered,
        timestamp: new Date().toISOString(),
      },
      "Chatbot response generated successfully."
    )
  );
});
