/**
 * CoBuy AI — Master Database Seeder (SAH-10)
 *
 * Populates all 4 core evaluation scenarios and demo accounts across all 18 models:
 *  1. Demo User & Shop Accounts:
 *     - Retailers: Shop A (retailer1@example.com), Shop B (retailer2@example.com), Shop C (retailer3@example.com)
 *     - Wholesalers: Supplier 1 (wholesaler1@example.com), Supplier 2 (wholesaler2@example.com)
 *     - Platform Administrators: Admin (admin@example.com), Reviewer (reviewer@example.com)
 *     - Default Password: Password123!
 *
 *  2. Scenario 1 (The Mandatory ₹4,800 Paper Cups Group Pool):
 *     - 60 cartons target MOQ (Tiers: 1-29 @ ₹100, 30-59 @ ₹90, 60+ @ ₹80)
 *     - Shop A (20 boxes) + Shop B (15 boxes) + Shop C (25 boxes) = 60 boxes
 *     - Unlocks ₹80 tier -> Exactly ₹4,800 grand merchandise total!
 *
 *  3. Scenario 2 (Two-Level MOQ & Step Multiple Validation):
 *     - Wholesaler MOQ = 1000, Retailer MOQ (20%) = 200, Step (1%) = 10
 *
 *  4. Scenario 3 (72h Expired Under-MOQ Pool in 24h Buyer Decision Window):
 *     - Target 1000 units, achieved 600 units, state = UNDER_MOQ_DECISION_PENDING
 *     - Grounded AI advisory recommendation card
 *
 *  5. Scenario 4 (Incompatible Requirement):
 *     - Deliberately incompatible requirement (Polystyrene cups) demonstrating safety blocking
 *
 * Usage:
 *   npm run seed  (or node scripts/seedDemoData.js)
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import env from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';

// Models
import { User } from '../src/models/User.model.js';
import { Shop } from '../src/models/Shop.model.js';
import { Supplier } from '../src/models/Supplier.model.js';
import { Product } from '../src/models/Product.model.js';
import { SupplierOffer } from '../src/models/SupplierOffer.model.js';
import { GroupBuyPool } from '../src/models/GroupBuyPool.model.js';
import { Contribution } from '../src/models/Contribution.model.js';
import { PriceSnapshot } from '../src/models/PriceSnapshot.model.js';
import { Payment } from '../src/models/Payment.model.js';
import { Requirement } from '../src/models/Requirement.model.js';
import { Notification } from '../src/models/Notification.model.js';
import { AuditLog } from '../src/models/AuditLog.model.js';
import { SupplierSettlement } from '../src/models/SupplierSettlement.model.js';

if (env.NODE_ENV === 'production') {
  console.error('❌  ABORTED: Cannot run demo seeder in production environment.');
  process.exit(1);
}

const PASSWORD_PLAIN = 'Password123!';

async function seedMasterData() {
  console.log('🚀 Starting CoBuy AI Master Database Seeder (SAH-10)...');
  await connectDB();

  // ── 1. Create or Find Products ───────────────────────────────────────────────
  console.log('📦 Seeding Catalogue Products...');
  let cupProduct = await Product.findOne({ canonicalName: 'Bio-Degradable Coffee Cups 250ml' });
  if (!cupProduct) {
    cupProduct = await Product.create({
      canonicalName: 'Bio-Degradable Coffee Cups 250ml',
      category: 'PACKAGING',
      baseUnit: 'BOX',
      packSizeDescription: '1000 cups / carton',
      unitsPerPack: 1000,
      specifications: {
        material: 'PLA-Lined Kraft Paper',
        capacityOrSize: '250ml',
        foodSafe: true,
        certifications: ['FSSAI', 'FDA'],
        grade: 'FOOD_GRADE',
      },
      synonyms: ['paper cups', 'coffee cups', 'tea cups'],
      brand: 'GENERIC',
    });
  }

  let riceProduct = await Product.findOne({ canonicalName: 'Basmati Rice Extra Long Grain 5kg' });
  if (!riceProduct) {
    riceProduct = await Product.create({
      canonicalName: 'Basmati Rice Extra Long Grain 5kg',
      category: 'GRAINS',
      baseUnit: 'BAG',
      packSizeDescription: '5kg bag',
      unitsPerPack: 1,
      specifications: {
        material: 'Paddy Rice',
        capacityOrSize: '5kg',
        foodSafe: true,
        grade: 'PREMIUM',
      },
      synonyms: ['basmati', 'rice'],
      brand: 'GENERIC',
    });
  }

  // ── 2. Create Wholesaler Suppliers ──────────────────────────────────────────
  console.log('🏭 Seeding Wholesaler Suppliers...');
  let supplier1 = await Supplier.findOne({ name: 'North India EcoPack Wholesalers' });
  if (!supplier1) {
    supplier1 = await Supplier.create({
      name: 'North India EcoPack Wholesalers',
      legalBusinessName: 'North India EcoPack Wholesalers Pvt Ltd',
      serviceAreas: ['LUCKNOW', 'KANPUR', 'VARANASI', 'DELHI_NCR'],
      verificationStatus: 'VERIFIED',
      dataSourceType: 'SEEDED_DEMO',
      contactEmail: 'wholesaler1@example.com',
      contactPhone: '+919876543201',
      isActive: true,
      tradeTerms: {
        paymentTermsDays: 7,
        cancellationPolicyDays: 2,
      },
    });
  }

  let supplier2 = await Supplier.findOne({ name: 'Ganga FMCG Bulk Distributors' });
  if (!supplier2) {
    supplier2 = await Supplier.create({
      name: 'Ganga FMCG Bulk Distributors',
      legalBusinessName: 'Ganga FMCG Distributors LLP',
      serviceAreas: ['LUCKNOW', 'KANPUR', 'AGRA', 'NOIDA'],
      verificationStatus: 'VERIFIED',
      dataSourceType: 'SEEDED_DEMO',
      contactEmail: 'wholesaler2@example.com',
      contactPhone: '+919876543202',
      isActive: true,
    });
  }

  // ── 3. Create Wholesale Offers ───────────────────────────────────────────────
  console.log('🏷️ Seeding Supplier Wholesale Offers...');
  let cupOffer = await SupplierOffer.findOne({ supplierId: supplier1._id, productId: cupProduct._id });
  if (!cupOffer) {
    cupOffer = await SupplierOffer.create({
      supplierId: supplier1._id,
      productId: cupProduct._id,
      minimumOrderQuantity: 60,
      retailerMoqPercentage: 20,
      retailerStepPercentage: 1,
      packUnit: 'BOX',
      packSize: '1000 cups',
      baseUnitPriceMinor: 10000, // ₹100.00
      currency: 'INR',
      quantityTiers: [
        { minQuantity: 1, unitPriceMinor: 10000 },
        { minQuantity: 30, unitPriceMinor: 9000 },
        { minQuantity: 60, unitPriceMinor: 8000 },
      ],
      flatShippingCostMinor: 0,
      shippingAllocationMethod: 'PER_UNIT',
      deliveryAreas: ['LUCKNOW', 'KANPUR', 'AGRA'],
      expiresAt: new Date(Date.now() + 30 * 86400000),
      dataSourceType: 'SEEDED_DEMO',
      verificationStatus: 'DEMO_SAMPLE',
      isActive: true,
    });
  }

  let riceOffer = await SupplierOffer.findOne({ supplierId: supplier2._id, productId: riceProduct._id });
  if (!riceOffer) {
    riceOffer = await SupplierOffer.create({
      supplierId: supplier2._id,
      productId: riceProduct._id,
      minimumOrderQuantity: 1000,
      retailerMoqPercentage: 20,
      retailerStepPercentage: 1,
      packUnit: 'BAG',
      packSize: '5kg',
      baseUnitPriceMinor: 50000, // ₹500.00
      currency: 'INR',
      quantityTiers: [
        { minQuantity: 1, unitPriceMinor: 50000 },
        { minQuantity: 500, unitPriceMinor: 46000 },
        { minQuantity: 1000, unitPriceMinor: 42000 },
      ],
      flatShippingCostMinor: 500000,
      shippingAllocationMethod: 'PER_UNIT',
      deliveryAreas: ['LUCKNOW', 'KANPUR', 'AGRA', 'NOIDA'],
      expiresAt: new Date(Date.now() + 30 * 86400000),
      dataSourceType: 'SEEDED_DEMO',
      verificationStatus: 'DEMO_SAMPLE',
      isActive: true,
    });
  }

  // ── 4. Create Demo Users & Linked Shops ─────────────────────────────────────
  console.log('👤 Seeding Demo Users & Shops...');
  const userSeeds = [
    { email: 'retailer1@example.com', name: 'Ramesh Sharma (Shop A)', role: 'SHOP_OWNER', shopName: 'Hazratganj Café & Stores', area: 'LUCKNOW' },
    { email: 'retailer2@example.com', name: 'Suresh Gupta (Shop B)', role: 'SHOP_OWNER', shopName: 'Gomti Nagar Kirana Mart', area: 'LUCKNOW' },
    { email: 'retailer3@example.com', name: 'Amit Verma (Shop C)', role: 'SHOP_OWNER', shopName: 'Alambagh Daily Needs', area: 'LUCKNOW' },
    { email: 'wholesaler1@example.com', name: 'Vikram Mehta (Supplier 1)', role: 'SUPPLIER', shopName: 'EcoPack Distribution Hub', area: 'LUCKNOW' },
    { email: 'wholesaler2@example.com', name: 'Rajesh Singhal (Supplier 2)', role: 'SUPPLIER', shopName: 'Ganga FMCG Depot', area: 'LUCKNOW' },
    { email: 'admin@example.com', name: 'System Administrator', role: 'ADMIN', shopName: 'Platform Ops HQ', area: 'LUCKNOW' },
    { email: 'reviewer@example.com', name: 'Compliance Reviewer', role: 'REVIEWER', shopName: 'Audit Review Room', area: 'LUCKNOW' },
    // Frontend Demo Buttons aliases (Docs/database_schemas.md)
    { email: 'cafea@demo.aapkidukan.in', name: 'Hazratganj Artisan Café (Shop A)', role: 'SHOP_OWNER', shopName: 'Hazratganj Artisan Café', area: 'LUCKNOW' },
    { email: 'bakeryb@demo.aapkidukan.in', name: 'Gomti Bakery & Espresso (Shop B)', role: 'SHOP_OWNER', shopName: 'Gomti Bakery & Espresso', area: 'LUCKNOW' },
    { email: 'bistroc@demo.aapkidukan.in', name: 'Awadh Bistro & Roasters (Shop C)', role: 'SHOP_OWNER', shopName: 'Awadh Bistro & Roasters', area: 'LUCKNOW' },
    { email: 'supplier1@demo.aapkidukan.in', name: 'Bharat EcoPack', role: 'SUPPLIER', shopName: 'Bharat EcoPack Distribution Hub', area: 'LUCKNOW' },
    { email: 'admin@demo.aapkidukan.in', name: 'Platform Admin', role: 'ADMIN', shopName: 'Platform Ops HQ', area: 'LUCKNOW' },
    { email: 'reviewer@demo.aapkidukan.in', name: 'Read-Only Evaluator', role: 'REVIEWER', shopName: 'Audit Review Room', area: 'LUCKNOW' },
  ];

  const userMap = {};
  const shopMap = {};

  for (const u of userSeeds) {
    let userDoc = await User.findOne({ email: u.email });
    if (!userDoc) {
      userDoc = new User({
        name: u.name,
        email: u.email,
        passwordHash: PASSWORD_PLAIN, // pre-save middleware will hash with bcrypt
        role: u.role,
        status: 'ACTIVE',
      });
      await userDoc.save();
    }
    userMap[u.email] = userDoc;

    let shopDoc = await Shop.findOne({ ownerUserId: userDoc._id });
    if (!shopDoc) {
      shopDoc = await Shop.create({
        ownerUserId: userDoc._id,
        name: u.shopName,
        businessType: u.role === 'SUPPLIER' ? 'OTHER' : 'KIRANA_RETAIL',
        deliveryArea: u.area,
        deliveryAddress: {
          street: `Plot ${Math.floor(Math.random() * 50) + 1}, Main Market`,
          city: 'Lucknow',
          state: 'Uttar Pradesh',
          postalCode: '226001',
          country: 'IN',
        },
        contactDetails: {
          phone: '+919876543210',
        },
      });
    }
    shopMap[u.email] = shopDoc;
  }

  // ── 5. Scenario 1: The Mandatory ₹4,800 Paper Cups Group Pool ────────────────
  console.log('☕ Seeding Scenario 1: Mandatory ₹4,800 Paper Cups Group Pool...');
  let cupPool = await GroupBuyPool.findOne({ title: 'Lucknow Kirana Bio-Cups Bulk Pool (₹4,800 Goal)' });
  if (!cupPool) {
    cupPool = await GroupBuyPool.create({
      title: 'Lucknow Kirana Bio-Cups Bulk Pool (₹4,800 Goal)',
      createdByUserId: userMap['retailer1@example.com']._id,
      productId: cupProduct._id,
      supplierOfferId: cupOffer._id,
      deliveryArea: 'LUCKNOW',
      currency: 'INR',
      packUnit: 'BOX',
      targetMoq: 60,
      retailerMoqPercentage: 20,
      retailerStepPercentage: 1,
      minRetailerQuantity: 12,
      quantityStepMultiple: 1,
      totalEligibleQuantity: 60,
      participantCount: 3,
      baseUnitPriceMinor: 10000,
      currentUnitPriceMinor: 8000, // Unlocked tier: ₹80.00
      estimatedMerchandiseTotalMinor: 480000, // Exactly ₹4,800.00 (480,000 paise)
      shippingCostMinor: 0,
      shippingAllocationMethod: 'PER_UNIT',
      paymentPolicy: 'PAY_AT_JOIN',
      publishedAt: new Date(Date.now() - 24 * 3600000),
      deadline: new Date(Date.now() + 48 * 3600000),
      state: 'AWAITING_APPROVALS',
      dataSourceType: 'SEEDED_DEMO',
      pricingTiers: [
        { minQuantity: 1, unitPriceMinor: 10000 },
        { minQuantity: 30, unitPriceMinor: 9000 },
        { minQuantity: 60, unitPriceMinor: 8000 },
      ],
    });

    // Contributions: Shop A (20 boxes), Shop B (15 boxes), Shop C (25 boxes) = 60 boxes
    const contribA = await Contribution.create({
      poolId: cupPool._id,
      shopId: shopMap['retailer1@example.com']._id,
      createdByUserId: userMap['retailer1@example.com']._id,
      quantity: 20,
      unit: 'BOX',
      unitPriceMinor: 8000,
      estimatedMerchandiseShareMinor: 160000, // ₹1,600
      finalTotalPayableMinor: 160000,
      totalPaidMinor: 160000,
      approvalStatus: 'PENDING_APPROVAL',
      state: 'ACTIVE',
    });

    const contribB = await Contribution.create({
      poolId: cupPool._id,
      shopId: shopMap['retailer2@example.com']._id,
      createdByUserId: userMap['retailer2@example.com']._id,
      quantity: 15,
      unit: 'BOX',
      unitPriceMinor: 8000,
      estimatedMerchandiseShareMinor: 120000, // ₹1,200
      finalTotalPayableMinor: 120000,
      totalPaidMinor: 120000,
      approvalStatus: 'PENDING_APPROVAL',
      state: 'ACTIVE',
    });

    const contribC = await Contribution.create({
      poolId: cupPool._id,
      shopId: shopMap['retailer3@example.com']._id,
      createdByUserId: userMap['retailer3@example.com']._id,
      quantity: 25,
      unit: 'BOX',
      unitPriceMinor: 8000,
      estimatedMerchandiseShareMinor: 200000, // ₹2,000
      finalTotalPayableMinor: 200000,
      totalPaidMinor: 200000,
      approvalStatus: 'PENDING_APPROVAL',
      state: 'ACTIVE',
    });

    // Create Price Snapshot version 1
    const snapshot = await PriceSnapshot.create({
      poolId: cupPool._id,
      version: 1,
      supplierOfferId: cupOffer._id,
      currency: 'INR',
      totalEligibleQuantity: 60,
      baseUnitPriceMinor: 10000,
      appliedUnitPriceMinor: 8000,
      merchandiseTotalMinor: 480000, // ₹4,800
      shippingCostMinor: 0,
      shippingStatus: 'KNOWN',
      groupTotalPayableMinor: 480000,
      memberShares: [
        {
          contributionId: contribA._id,
          shopId: contribA.shopId,
          quantity: 20,
          unit: 'BOX',
          appliedUnitPriceMinor: 8000,
          merchandiseShareMinor: 160000,
          shippingShareMinor: 0,
          roundingAdjustmentMinor: 0,
          totalPayableMinor: 160000,
          verifiedSavingsMinor: 40000,
        },
        {
          contributionId: contribB._id,
          shopId: contribB.shopId,
          quantity: 15,
          unit: 'BOX',
          appliedUnitPriceMinor: 8000,
          merchandiseShareMinor: 120000,
          shippingShareMinor: 0,
          roundingAdjustmentMinor: 0,
          totalPayableMinor: 120000,
          verifiedSavingsMinor: 30000,
        },
        {
          contributionId: contribC._id,
          shopId: contribC.shopId,
          quantity: 25,
          unit: 'BOX',
          appliedUnitPriceMinor: 8000,
          merchandiseShareMinor: 200000,
          shippingShareMinor: 0,
          roundingAdjustmentMinor: 0,
          totalPayableMinor: 200000,
          verifiedSavingsMinor: 50000,
        },
      ],
    });

    cupPool.latestPriceSnapshotId = snapshot._id;
    cupPool.priceBreakdownVersion = 1;
    await cupPool.save();

    // Seed Verified Captured Payments
    for (const [contrib, amount] of [
      [contribA, 160000],
      [contribB, 120000],
      [contribC, 200000],
    ]) {
      await Payment.create({
        poolId: cupPool._id,
        contributionId: contrib._id,
        shopId: contrib.shopId,
        payerUserId: contrib.createdByUserId,
        amountMinor: amount,
        currency: 'INR',
        paymentPurpose: 'INITIAL_JOIN',
        provider: 'PAYPAL_SANDBOX',
        providerOrderId: `MOCK_ORDER_${contrib._id}`,
        providerCaptureId: `MOCK_CAP_${contrib._id}`,
        idempotencyKey: `SEED_IDEMP_${contrib._id}`,
        status: 'PAID',
        isTestTransaction: true,
      });
    }

    // Seed Notification
    await Notification.create({
      recipientUserId: userMap['retailer1@example.com']._id,
      shopId: shopMap['retailer1@example.com']._id,
      poolId: cupPool._id,
      type: 'MOQ_REACHED_LOCKED',
      title: 'MOQ Milestone Reached: ₹4,800 Bulk Tier Unlocked!',
      message: 'The Lucknow Paper Cups Pool reached its 60-box target! Review your final snapshot terms.',
      isRead: false,
    });
  }

  // ── 6. Scenario 2: Two-Level MOQ 1000 Pool ──────────────────────────────────
  console.log('🌾 Seeding Scenario 2: 1000 MOQ Basmati Rice Pool...');
  let ricePool = await GroupBuyPool.findOne({ title: 'Lucknow Wholesale Basmati Rice Pool (1000 MOQ)' });
  if (!ricePool) {
    ricePool = await GroupBuyPool.create({
      title: 'Lucknow Wholesale Basmati Rice Pool (1000 MOQ)',
      createdByUserId: userMap['retailer1@example.com']._id,
      productId: riceProduct._id,
      supplierOfferId: riceOffer._id,
      deliveryArea: 'LUCKNOW',
      currency: 'INR',
      packUnit: 'BAG',
      targetMoq: 1000,
      retailerMoqPercentage: 20,
      retailerStepPercentage: 1,
      minRetailerQuantity: 200,
      quantityStepMultiple: 10,
      totalEligibleQuantity: 400,
      participantCount: 2,
      baseUnitPriceMinor: 50000,
      currentUnitPriceMinor: 50000,
      estimatedMerchandiseTotalMinor: 20000000,
      shippingCostMinor: 500000,
      shippingAllocationMethod: 'PER_UNIT',
      paymentPolicy: 'PAY_AT_JOIN',
      publishedAt: new Date(Date.now() - 10 * 3600000),
      deadline: new Date(Date.now() + 62 * 3600000),
      state: 'RECRUITING',
      dataSourceType: 'SEEDED_DEMO',
      pricingTiers: [
        { minQuantity: 1, unitPriceMinor: 50000 },
        { minQuantity: 500, unitPriceMinor: 46000 },
        { minQuantity: 1000, unitPriceMinor: 42000 },
      ],
    });

    await Contribution.create({
      poolId: ricePool._id,
      shopId: shopMap['retailer1@example.com']._id,
      createdByUserId: userMap['retailer1@example.com']._id,
      quantity: 200,
      unit: 'BAG',
      unitPriceMinor: 50000,
      estimatedMerchandiseShareMinor: 10000000,
      finalTotalPayableMinor: 10000000,
      totalPaidMinor: 10000000,
      state: 'ACTIVE',
    });
  }

  // ── 7. Scenario 3: Expired 72h Under-MOQ Pool (600/1000) in 24h Decision ─────
  console.log('⏰ Seeding Scenario 3: 72h Expired Under-MOQ Pool in 24h Decision Window...');
  let underMoqPool = await GroupBuyPool.findOne({ title: 'Lucknow Premium Rice Pool (Under-MOQ Resolution)' });
  if (!underMoqPool) {
    underMoqPool = await GroupBuyPool.create({
      title: 'Lucknow Premium Rice Pool (Under-MOQ Resolution)',
      createdByUserId: userMap['retailer1@example.com']._id,
      productId: riceProduct._id,
      supplierOfferId: riceOffer._id,
      deliveryArea: 'LUCKNOW',
      currency: 'INR',
      packUnit: 'BAG',
      targetMoq: 1000,
      retailerMoqPercentage: 20,
      retailerStepPercentage: 1,
      minRetailerQuantity: 200,
      quantityStepMultiple: 10,
      totalEligibleQuantity: 600,
      participantCount: 2,
      baseUnitPriceMinor: 50000,
      currentUnitPriceMinor: 46000,
      estimatedMerchandiseTotalMinor: 27600000,
      shippingCostMinor: 500000,
      shippingAllocationMethod: 'PER_UNIT',
      paymentPolicy: 'PAY_AT_JOIN',
      publishedAt: new Date(Date.now() - 73 * 3600000),
      deadline: new Date(Date.now() - 1 * 3600000), // Expired 1h ago
      lockedAt: new Date(Date.now() - 1 * 3600000),
      lockReason: 'EXPIRED_72H_UNDER_MOQ',
      state: 'UNDER_MOQ_DECISION_PENDING',
      decisionDeadline: new Date(Date.now() + 23 * 3600000), // 23h remaining in 24h window
      dataSourceType: 'SEEDED_DEMO',
      underMoqAdvisory: {
        suggestedAction: 'PROCEED',
        explanation:
          'Achieved 600 / 1000 bags (60%). Wholesaler has accepted sub-MOQ dispatch at Tier 2 price (₹460/bag). Proceeding maintains a 8% bulk discount vs single retail baseline.',
        uncertainties: ['Delivery window may extend by 24-48 hours.'],
      },
      pricingTiers: [
        { minQuantity: 1, unitPriceMinor: 50000 },
        { minQuantity: 500, unitPriceMinor: 46000 },
        { minQuantity: 1000, unitPriceMinor: 42000 },
      ],
    });

    await Contribution.create({
      poolId: underMoqPool._id,
      shopId: shopMap['retailer1@example.com']._id,
      createdByUserId: userMap['retailer1@example.com']._id,
      quantity: 300,
      unit: 'BAG',
      unitPriceMinor: 46000,
      estimatedMerchandiseShareMinor: 13800000,
      finalTotalPayableMinor: 13800000,
      totalPaidMinor: 13800000,
      state: 'ACTIVE',
    });
  }

  // ── 8. Scenario 4: Incompatible Requirement (Safety Block) ──────────────────
  console.log('🚫 Seeding Scenario 4: Incompatible Requirement (Polystyrene Safety Block)...');
  let badReq = await Requirement.findOne({ title: 'Non-compliant 8-oz Polystyrene Foam Cups' });
  if (!badReq) {
    badReq = await Requirement.create({
      shopId: shopMap['retailer1@example.com']._id,
      createdByUserId: userMap['retailer1@example.com']._id,
      title: 'Non-compliant 8-oz Polystyrene Foam Cups',
      originalDescription: 'Need 10,000 units of cheap polystyrene foam hot cups for tea stall.',
      sourceType: 'TEXT',
      status: 'NEEDS_REVIEW',
      confirmedFields: {
        productName: '8-oz Polystyrene Foam Cups',
        material: 'Expanded Polystyrene (EPS)',
        quantity: 10000,
        unit: 'UNIT',
        deliveryArea: 'LUCKNOW',
      },
    });
  }

  // ── 9. Audit Log Event ──────────────────────────────────────────────────────
  await AuditLog.create({
    correlationId: 'seed-demo-data-' + Date.now(),
    actorId: userMap['admin@example.com']._id,
    actorRole: 'ADMIN',
    action: 'SEED_DEMO_DATA',
    resourceType: 'POOL',
    resourceId: userMap['admin@example.com']._id.toString(),
    metadata: {
      scenariosSeeded: 4,
      totalAccounts: userSeeds.length,
      timestamp: new Date().toISOString(),
    },
  });

  console.log('✅ CoBuy AI Master Database Seeder (SAH-10) Completed Successfully!');
  console.log('-------------------------------------------------------------');
  console.log('Demo Credentials (All accounts use password: Password123!)');
  console.log('  Retailers:   retailer1@example.com, retailer2@example.com, retailer3@example.com');
  console.log('  Wholesalers: wholesaler1@example.com, wholesaler2@example.com');
  console.log('  Admin:       admin@example.com');
  console.log('  Reviewer:    reviewer@example.com');
  console.log('-------------------------------------------------------------');

  await disconnectDB();
}

seedMasterData().catch((err) => {
  console.error('❌  Master Seeder Failed:', err);
  process.exit(1);
});
