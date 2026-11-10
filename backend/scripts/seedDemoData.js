/**
 * CoBuy AI — Master Database Seeder (SAH-10 / Extended Multi-Category Catalogue)
 *
 * Populates:
 *  1. Demo User & Shop Accounts (Shop A, Shop B, Shop C, Suppliers, Admin, Reviewer)
 *  2. 60 Master Products across 6 Wholesale Categories (~10 products per category):
 *     - PACKAGING (Packaging & Disposables)
 *     - OILS (Cooking Oils, Ghee & Beverages)
 *     - GRAINS (Bulk Grains & Pulses)
 *     - CLEANING (Commercial Cleaning & Hygiene)
 *     - SPICES (Spices & Condiments)
 *     - KITCHEN (Commercial Kitchen Supplies)
 *  3. 8 Verified Regional Suppliers & Offers with Volume Tier Pricing
 *  4. Core Scenarios:
 *     - Scenario 1: The Mandatory ₹4,800 Paper Cups Group Pool & Confirmed Order AKD-2026-0001
 *     - Scenario 2: Two-Level MOQ 1000 Basmati Rice Pool
 *     - Scenario 3: 72h Expired Under-MOQ Pool (600/1000) in 24h Buyer Decision Window
 *     - Scenario 4: Incompatible Polystyrene Requirement (Safety Blocking)
 *  5. 12 Active Partial Group Buy Pools (2 per category in RECRUITING state):
 *     - 2–3 active merchant contributions from Shop A, Shop B, Shop C
 *     - Verified captured Payment records in MongoDB (PAID status)
 *     - Real-time pooled quantity, participant counts, and active 72h countdowns
 *
 * Usage:
 *   node backend/scripts/seedDemoData.js
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
import { Order } from '../src/models/Order.model.js';
import { Requirement } from '../src/models/Requirement.model.js';
import { Notification } from '../src/models/Notification.model.js';
import { AuditLog } from '../src/models/AuditLog.model.js';
import { SupplierSettlement } from '../src/models/SupplierSettlement.model.js';
import { Refund } from '../src/models/Refund.model.js';
import { createFinalOrderFromFundedPool } from '../src/services/orders/order.service.js';
import clockService from '../src/services/clock/clock.service.js';

// Intentional Opt-In Guard to protect clean environments against accidental seeding
const hasOptIn =
  process.env.ALLOW_DEMO_SEEDING === 'true' ||
  process.argv.includes('--confirm-seed') ||
  process.argv.includes('--force');
if (!hasOptIn) {
  console.warn('\n⚠️  DEMO SEEDING GUARD: Demo seeding is disabled by default to protect clean testing environments.');
  console.warn('To intentionally repopulate demo data for development/evaluations, run with:');
  console.warn('   node backend/scripts/seedDemoData.js --confirm-seed');
  console.warn('   or set environment variable ALLOW_DEMO_SEEDING=true\n');
  process.exit(0);
}

if (env.NODE_ENV === 'production') {
  console.error('❌ ABORTED: Cannot run demo seeder in production environment.');
  process.exit(1);
}

const PASSWORD_PLAIN = 'Password123!';

// ─────────────────────────────────────────────────────────────────────────────
// 60 PRODUCTS CATALOGUE DEFINITIONS (10 per category)
// ─────────────────────────────────────────────────────────────────────────────
const CATALOGUE_PRODUCTS = [
  // ── 1. PACKAGING (Packaging & Disposables) ──────────────────────────────────
  {
    canonicalName: 'Bio-Degradable Coffee Cups 250ml',
    category: 'PACKAGING',
    baseUnit: 'BOX',
    packSizeDescription: '1000 cups / carton',
    unitsPerPack: 1000,
    specifications: { material: 'PLA-Lined Kraft Paper', capacityOrSize: '250ml', foodSafe: true, certifications: ['FSSAI', 'FDA'], grade: 'FOOD_GRADE' },
    synonyms: ['paper cups', 'coffee cups', 'tea cups', 'compostable cups'],
    supplierKey: 'Apex Packaging Ltd',
    baseUnitPriceMinor: 10000,
    moq: 60,
    tiers: [{ minQuantity: 1, maxQuantity: 29, unitPriceMinor: 10000 }, { minQuantity: 30, maxQuantity: 59, unitPriceMinor: 9000 }, { minQuantity: 60, maxQuantity: null, unitPriceMinor: 8000 }],
  },
  {
    canonicalName: '12oz Eco Kraft Paper Cups (1,000 pk)',
    category: 'PACKAGING',
    baseUnit: 'CARTON',
    packSizeDescription: '1000 cups / carton',
    unitsPerPack: 1000,
    specifications: { material: 'Kraft Paperboard PE-Lined', capacityOrSize: '12oz / 350ml', foodSafe: true, certifications: ['FSSAI'], grade: 'FOOD_GRADE' },
    synonyms: ['12oz cups', 'kraft cups', 'hot drink cups', 'disposable cups'],
    supplierKey: 'Apex Packaging Ltd',
    baseUnitPriceMinor: 10000,
    moq: 1000,
    minRetailerQuantity: 200,
    step: 5,
    tiers: [{ minQuantity: 1, maxQuantity: 499, unitPriceMinor: 10000 }, { minQuantity: 500, maxQuantity: 999, unitPriceMinor: 9000 }, { minQuantity: 1000, maxQuantity: null, unitPriceMinor: 8000 }],
    isPartialPool: true,
    partialPoolKey: 'AKD-POOL-PKG-01',
    partialContributions: [
      { shopKey: 'bakeryb@demo.aapkidukan.in', quantity: 350, unitPriceMinor: 8000 },
      { shopKey: 'bistroc@demo.aapkidukan.in', quantity: 300, unitPriceMinor: 8000 },
    ],
  },
  {
    canonicalName: 'Heavy Duty Kraft Takeaway Bags with Handle (500 pk)',
    category: 'PACKAGING',
    baseUnit: 'PACK',
    packSizeDescription: '500 bags / pack',
    unitsPerPack: 500,
    specifications: { material: '120 GSM Brown Kraft Paper', capacityOrSize: 'Large 12x10x6 inch', foodSafe: true, certifications: ['ISO-9001'], grade: 'HEAVY_DUTY' },
    synonyms: ['kraft bags', 'paper bags', 'delivery bags', 'shopping bags'],
    supplierKey: 'GreenPack Industries',
    baseUnitPriceMinor: 58000,
    moq: 300,
    minRetailerQuantity: 15,
    step: 5,
    tiers: [{ minQuantity: 1, maxQuantity: 99, unitPriceMinor: 58000 }, { minQuantity: 100, maxQuantity: 249, unitPriceMinor: 51000 }, { minQuantity: 250, maxQuantity: null, unitPriceMinor: 45000 }],
    isPartialPool: true,
    partialPoolKey: 'AKD-POOL-PKG-02',
    partialContributions: [
      { shopKey: 'bakeryb@demo.aapkidukan.in', quantity: 100, unitPriceMinor: 45000 },
      { shopKey: 'bistroc@demo.aapkidukan.in', quantity: 60, unitPriceMinor: 45000 },
    ],
  },
  {
    canonicalName: 'Kraft Takeaway Box 750ml (500 pk)',
    category: 'PACKAGING',
    baseUnit: 'CARTON',
    packSizeDescription: '500 boxes / carton',
    unitsPerPack: 500,
    specifications: { material: 'Kraft Paperboard PE-Coated', capacityOrSize: '750ml', foodSafe: true, grade: 'FOOD_GRADE' },
    synonyms: ['meal box', 'lunch box', 'kraft food box'],
    supplierKey: 'Apex Packaging Ltd',
    baseUnitPriceMinor: 72000,
    moq: 150,
    tiers: [{ minQuantity: 1, maxQuantity: 49, unitPriceMinor: 72000 }, { minQuantity: 50, maxQuantity: 99, unitPriceMinor: 66000 }, { minQuantity: 100, maxQuantity: null, unitPriceMinor: 60000 }],
  },
  {
    canonicalName: 'Ripple Wall Coffee Cups 8oz (500 pk)',
    category: 'PACKAGING',
    baseUnit: 'CARTON',
    packSizeDescription: '500 cups / carton',
    unitsPerPack: 500,
    specifications: { material: 'Triple Wall Kraft Insulated', capacityOrSize: '8oz / 240ml', foodSafe: true, grade: 'PREMIUM' },
    synonyms: ['ripple cups', 'insulated cups', 'tea cups'],
    supplierKey: 'GreenPack Industries',
    baseUnitPriceMinor: 65000,
    moq: 100,
    tiers: [{ minQuantity: 1, maxQuantity: 29, unitPriceMinor: 65000 }, { minQuantity: 30, maxQuantity: null, unitPriceMinor: 58000 }],
  },
  {
    canonicalName: 'Corrugated 3-Ply Shipping Boxes (Pack of 50)',
    category: 'PACKAGING',
    baseUnit: 'PACK',
    packSizeDescription: '50 boxes / bundle',
    unitsPerPack: 50,
    specifications: { material: 'Kraft Corrugated 3-Ply', capacityOrSize: '12x10x8 inch', foodSafe: false, grade: 'HEAVY_DUTY' },
    synonyms: ['carton boxes', 'courier boxes', 'shipping cartons'],
    supplierKey: 'Om Packaging Solutions',
    baseUnitPriceMinor: 85000,
    moq: 50,
    tiers: [{ minQuantity: 1, maxQuantity: 19, unitPriceMinor: 85000 }, { minQuantity: 20, maxQuantity: null, unitPriceMinor: 76000 }],
  },
  {
    canonicalName: 'Biodegradable Sugarcane Bagasse Meal Trays 3-Comp (250 pk)',
    category: 'PACKAGING',
    baseUnit: 'CARTON',
    packSizeDescription: '250 trays / carton',
    unitsPerPack: 250,
    specifications: { material: 'Sugarcane Bagasse Pulp', capacityOrSize: '3 Compartments 1000ml', foodSafe: true, grade: 'COMPOSTABLE' },
    synonyms: ['bagasse trays', 'compartment plates', 'thali plates'],
    supplierKey: 'Apex Packaging Ltd',
    baseUnitPriceMinor: 92000,
    moq: 80,
    tiers: [{ minQuantity: 1, maxQuantity: 29, unitPriceMinor: 92000 }, { minQuantity: 30, maxQuantity: null, unitPriceMinor: 82000 }],
  },
  {
    canonicalName: 'Clear PET Cold Drink Tumblers 350ml with Domes (1,000 pk)',
    category: 'PACKAGING',
    baseUnit: 'CARTON',
    packSizeDescription: '1000 tumblers with dome lids',
    unitsPerPack: 1000,
    specifications: { material: 'Food Grade Polyethylene (PET)', capacityOrSize: '350ml', foodSafe: true, grade: 'FOOD_GRADE' },
    synonyms: ['plastic cups', 'cold coffee cups', 'shake glasses'],
    supplierKey: 'Om Packaging Solutions',
    baseUnitPriceMinor: 115000,
    moq: 100,
    tiers: [{ minQuantity: 1, maxQuantity: 49, unitPriceMinor: 115000 }, { minQuantity: 50, maxQuantity: null, unitPriceMinor: 102000 }],
  },
  {
    canonicalName: 'Aluminium Foil Container 450ml with Lids (500 pk)',
    category: 'PACKAGING',
    baseUnit: 'CARTON',
    packSizeDescription: '500 containers with board lids',
    unitsPerPack: 500,
    specifications: { material: 'Pure Food Grade Aluminium Foil', capacityOrSize: '450ml', foodSafe: true, grade: 'HEAVY_GAUGE' },
    synonyms: ['foil box', 'biryani container', 'aluminium pack'],
    supplierKey: 'Apex Packaging Ltd',
    baseUnitPriceMinor: 88000,
    moq: 100,
    tiers: [{ minQuantity: 1, maxQuantity: 39, unitPriceMinor: 88000 }, { minQuantity: 40, maxQuantity: null, unitPriceMinor: 78000 }],
  },
  {
    canonicalName: '2-Cup Kraft Drink Carrier Holders (250 pk)',
    category: 'PACKAGING',
    baseUnit: 'PACK',
    packSizeDescription: '250 flat folded carriers',
    unitsPerPack: 250,
    specifications: { material: 'Recycled Kraft Board', capacityOrSize: 'Dual Cup Hold', foodSafe: true, grade: 'STANDARD' },
    synonyms: ['cup holder', 'drink tray', 'cup carrier'],
    supplierKey: 'GreenPack Industries',
    baseUnitPriceMinor: 42000,
    moq: 60,
    tiers: [{ minQuantity: 1, maxQuantity: 19, unitPriceMinor: 42000 }, { minQuantity: 20, maxQuantity: null, unitPriceMinor: 37000 }],
  },

  // ── 2. OILS / FOOD (Cooking Oils, Ghee & Beverages) ─────────────────────────
  {
    canonicalName: 'Cold Pressed Pure Mustard Oil (15L Tin)',
    category: 'OILS',
    baseUnit: 'TIN',
    packSizeDescription: '15 Litre Sealed Tin',
    unitsPerPack: 1,
    specifications: { material: 'Mustard Seeds (Kachi Ghani)', capacityOrSize: '15 Litres', foodSafe: true, certifications: ['FSSAI', 'AGMARK'], grade: 'AGMARK_GRADE_1' },
    synonyms: ['mustard oil', 'sarson tel', 'kachi ghani', 'cooking oil'],
    supplierKey: 'Bharat Agro Mills',
    baseUnitPriceMinor: 172000,
    moq: 500,
    minRetailerQuantity: 10,
    step: 2,
    tiers: [{ minQuantity: 1, maxQuantity: 199, unitPriceMinor: 172000 }, { minQuantity: 200, maxQuantity: 399, unitPriceMinor: 158000 }, { minQuantity: 400, maxQuantity: null, unitPriceMinor: 142000 }],
    isPartialPool: true,
    partialPoolKey: 'AKD-POOL-OIL-01',
    partialContributions: [
      { shopKey: 'bakeryb@demo.aapkidukan.in', quantity: 150, unitPriceMinor: 142000 },
      { shopKey: 'bistroc@demo.aapkidukan.in', quantity: 125, unitPriceMinor: 142000 },
    ],
  },
  {
    canonicalName: 'Desi Danedar Cow Ghee (15kg Tin)',
    category: 'OILS',
    baseUnit: 'TIN',
    packSizeDescription: '15 Kilogram Tin',
    unitsPerPack: 1,
    specifications: { material: 'Pure Cow Milk Fat', capacityOrSize: '15kg', foodSafe: true, certifications: ['FSSAI', 'AGMARK'], grade: 'AGMARK_SPECIAL' },
    synonyms: ['desi ghee', 'cow ghee', 'pure ghee', 'danedar ghee'],
    supplierKey: 'Bharat Agro Mills',
    baseUnitPriceMinor: 840000,
    moq: 200,
    minRetailerQuantity: 10,
    step: 2,
    tiers: [{ minQuantity: 1, maxQuantity: 49, unitPriceMinor: 840000 }, { minQuantity: 50, maxQuantity: 149, unitPriceMinor: 780000 }, { minQuantity: 150, maxQuantity: null, unitPriceMinor: 720000 }],
    isPartialPool: true,
    partialPoolKey: 'AKD-POOL-OIL-02',
    partialContributions: [
      { shopKey: 'bakeryb@demo.aapkidukan.in', quantity: 50, unitPriceMinor: 720000 },
      { shopKey: 'bistroc@demo.aapkidukan.in', quantity: 40, unitPriceMinor: 720000 },
    ],
  },
  {
    canonicalName: 'Refined Sunflower Cooking Oil (15L Tin)',
    category: 'OILS',
    baseUnit: 'TIN',
    packSizeDescription: '15 Litre Tin',
    unitsPerPack: 1,
    specifications: { material: 'Sunflower Seed Oil', capacityOrSize: '15 Litres', foodSafe: true, grade: 'FSSAI_GRADE_A' },
    synonyms: ['sunflower oil', 'light cooking oil', 'refined oil'],
    supplierKey: 'Bharat Agro Mills',
    baseUnitPriceMinor: 162000,
    moq: 150,
    tiers: [{ minQuantity: 1, maxQuantity: 49, unitPriceMinor: 162000 }, { minQuantity: 50, maxQuantity: null, unitPriceMinor: 148000 }],
  },
  {
    canonicalName: 'Filtered Groundnut Oil (15L Tin)',
    category: 'OILS',
    baseUnit: 'TIN',
    packSizeDescription: '15 Litre Tin',
    unitsPerPack: 1,
    specifications: { material: 'Peanut / Groundnut', capacityOrSize: '15 Litres', foodSafe: true, grade: 'PREMIUM' },
    synonyms: ['groundnut oil', 'mungfali tel', 'peanut oil'],
    supplierKey: 'Bharat Agro Mills',
    baseUnitPriceMinor: 235000,
    moq: 100,
    tiers: [{ minQuantity: 1, maxQuantity: 29, unitPriceMinor: 235000 }, { minQuantity: 30, maxQuantity: null, unitPriceMinor: 215000 }],
  },
  {
    canonicalName: 'Premium Rice Bran Cooking Oil (15L Tin)',
    category: 'OILS',
    baseUnit: 'TIN',
    packSizeDescription: '15 Litre Tin',
    unitsPerPack: 1,
    specifications: { material: 'Physically Refined Rice Bran', capacityOrSize: '15 Litres', foodSafe: true, grade: 'HIGH_ORYZANOL' },
    synonyms: ['rice bran oil', 'healthy cooking oil'],
    supplierKey: 'Bharat Agro Mills',
    baseUnitPriceMinor: 155000,
    moq: 120,
    tiers: [{ minQuantity: 1, maxQuantity: 39, unitPriceMinor: 155000 }, { minQuantity: 40, maxQuantity: null, unitPriceMinor: 142000 }],
  },
  {
    canonicalName: 'Commercial Bakery Vanaspati Ghee (15kg Tin)',
    category: 'OILS',
    baseUnit: 'TIN',
    packSizeDescription: '15 Kilogram Tin',
    unitsPerPack: 1,
    specifications: { material: 'Hydrogenated Vegetable Oil', capacityOrSize: '15kg', foodSafe: true, grade: 'BAKERY_COMMERCIAL' },
    synonyms: ['vanaspati', 'dalda', 'bakery shortening'],
    supplierKey: 'Bharat Agro Mills',
    baseUnitPriceMinor: 185000,
    moq: 100,
    tiers: [{ minQuantity: 1, maxQuantity: 29, unitPriceMinor: 185000 }, { minQuantity: 30, maxQuantity: null, unitPriceMinor: 168000 }],
  },
  {
    canonicalName: 'Extra Light Olive Oil Blend (5L Can)',
    category: 'OILS',
    baseUnit: 'CAN',
    packSizeDescription: '5 Litre Can',
    unitsPerPack: 1,
    specifications: { material: 'Refined Olive Oil & Virgin Blend', capacityOrSize: '5 Litres', foodSafe: true, grade: 'CULINARY_GRADE' },
    synonyms: ['olive oil', 'light olive oil', 'cooking olive oil'],
    supplierKey: 'Bharat Agro Mills',
    baseUnitPriceMinor: 295000,
    moq: 40,
    tiers: [{ minQuantity: 1, maxQuantity: 14, unitPriceMinor: 295000 }, { minQuantity: 15, maxQuantity: null, unitPriceMinor: 265000 }],
  },
  {
    canonicalName: 'Cold Pressed Virgin Sesame (Gingelly) Oil (5L Can)',
    category: 'OILS',
    baseUnit: 'CAN',
    packSizeDescription: '5 Litre Can',
    unitsPerPack: 1,
    specifications: { material: 'White Sesame Seeds', capacityOrSize: '5 Litres', foodSafe: true, grade: 'FOOD_GRADE' },
    synonyms: ['sesame oil', 'til tel', 'gingelly oil'],
    supplierKey: 'Bharat Agro Mills',
    baseUnitPriceMinor: 145000,
    moq: 50,
    tiers: [{ minQuantity: 1, maxQuantity: 19, unitPriceMinor: 145000 }, { minQuantity: 20, maxQuantity: null, unitPriceMinor: 130000 }],
  },
  {
    canonicalName: 'Refined Soyabean Oil (15L Tin)',
    category: 'OILS',
    baseUnit: 'TIN',
    packSizeDescription: '15 Litre Tin',
    unitsPerPack: 1,
    specifications: { material: 'Soyabean', capacityOrSize: '15 Litres', foodSafe: true, grade: 'STANDARD' },
    synonyms: ['soya oil', 'soyabean oil', 'cooking soya'],
    supplierKey: 'Bharat Agro Mills',
    baseUnitPriceMinor: 148000,
    moq: 150,
    tiers: [{ minQuantity: 1, maxQuantity: 49, unitPriceMinor: 148000 }, { minQuantity: 50, maxQuantity: null, unitPriceMinor: 134000 }],
  },
  {
    canonicalName: 'Premium Assam CTC Dust Tea (10kg Bag)',
    category: 'OILS', // grouped under FOOD / BEVERAGES
    baseUnit: 'BAG',
    packSizeDescription: '10kg Jute Lined Bag',
    unitsPerPack: 1,
    specifications: { material: 'Assam Black CTC Tea', capacityOrSize: '10kg', foodSafe: true, grade: 'HOTEL_BLEND' },
    synonyms: ['assam tea', 'chai patti', 'kadak chai tea'],
    supplierKey: 'Bharat Agro Mills',
    baseUnitPriceMinor: 260000,
    moq: 50,
    tiers: [{ minQuantity: 1, maxQuantity: 19, unitPriceMinor: 260000 }, { minQuantity: 20, maxQuantity: null, unitPriceMinor: 235000 }],
  },

  // ── 3. GRAINS (Bulk Grains & Pulses) ─────────────────────────────────────────
  {
    canonicalName: 'Basmati Rice Extra Long Grain 5kg',
    category: 'GRAINS',
    baseUnit: 'BAG',
    packSizeDescription: '5kg bag',
    unitsPerPack: 1,
    specifications: { material: 'Paddy Rice', capacityOrSize: '5kg', foodSafe: true, grade: 'PREMIUM' },
    synonyms: ['basmati', 'rice', 'extra long rice'],
    supplierKey: 'Kisan Golden Grain Wholesalers',
    baseUnitPriceMinor: 50000,
    moq: 1000,
    minRetailerQuantity: 200,
    step: 10,
    tiers: [{ minQuantity: 1, maxQuantity: 499, unitPriceMinor: 50000 }, { minQuantity: 500, maxQuantity: 999, unitPriceMinor: 46000 }, { minQuantity: 1000, maxQuantity: null, unitPriceMinor: 42000 }],
  },
  {
    canonicalName: 'Premium Sharbati Whole Wheat Atta (50kg Bag)',
    category: 'GRAINS',
    baseUnit: 'BAG',
    packSizeDescription: '50kg Woven Poly Bag',
    unitsPerPack: 1,
    specifications: { material: 'MP Sharbati Wheat', capacityOrSize: '50kg', foodSafe: true, certifications: ['FSSAI'], grade: 'CHAKKI_FRESH' },
    synonyms: ['wheat flour', 'sharbati atta', 'gehu atta', 'chakki atta'],
    supplierKey: 'Kisan Golden Grain Wholesalers',
    baseUnitPriceMinor: 215000,
    moq: 200,
    minRetailerQuantity: 5,
    step: 1,
    tiers: [{ minQuantity: 1, maxQuantity: 49, unitPriceMinor: 215000 }, { minQuantity: 50, maxQuantity: 119, unitPriceMinor: 198000 }, { minQuantity: 120, maxQuantity: null, unitPriceMinor: 182000 }],
    isPartialPool: true,
    partialPoolKey: 'AKD-POOL-GRN-01',
    partialContributions: [
      { shopKey: 'bakeryb@demo.aapkidukan.in', quantity: 60, unitPriceMinor: 182000 },
      { shopKey: 'bistroc@demo.aapkidukan.in', quantity: 45, unitPriceMinor: 182000 },
    ],
  },
  {
    canonicalName: '1121 Steam Extra Long Basmati Rice (25kg Bag)',
    category: 'GRAINS',
    baseUnit: 'BAG',
    packSizeDescription: '25kg Laminated Bag',
    unitsPerPack: 1,
    specifications: { material: '1121 Parboiled Basmati', capacityOrSize: '25kg', foodSafe: true, certifications: ['FSSAI'], grade: 'SUPER_FINE' },
    synonyms: ['1121 basmati', 'biryani rice', 'steam rice'],
    supplierKey: 'Kisan Golden Grain Wholesalers',
    baseUnitPriceMinor: 245000,
    moq: 500,
    minRetailerQuantity: 15,
    step: 5,
    tiers: [{ minQuantity: 1, maxQuantity: 99, unitPriceMinor: 245000 }, { minQuantity: 100, maxQuantity: 299, unitPriceMinor: 220000 }, { minQuantity: 300, maxQuantity: null, unitPriceMinor: 198000 }],
    isPartialPool: true,
    partialPoolKey: 'AKD-POOL-GRN-02',
    partialContributions: [
      { shopKey: 'bakeryb@demo.aapkidukan.in', quantity: 140, unitPriceMinor: 198000 },
      { shopKey: 'bistroc@demo.aapkidukan.in', quantity: 100, unitPriceMinor: 198000 },
    ],
  },
  {
    canonicalName: 'Desi Unpolished Toor / Arhar Dal (30kg Bag)',
    category: 'GRAINS',
    baseUnit: 'BAG',
    packSizeDescription: '30kg Bag',
    unitsPerPack: 1,
    specifications: { material: 'Pigeon Pea (Toor Dal)', capacityOrSize: '30kg', foodSafe: true, grade: 'NATURAL_UNPOLISHED' },
    synonyms: ['toor dal', 'arhar dal', 'tuvar dal'],
    supplierKey: 'Kisan Golden Grain Wholesalers',
    baseUnitPriceMinor: 375000,
    moq: 60,
    tiers: [{ minQuantity: 1, maxQuantity: 19, unitPriceMinor: 375000 }, { minQuantity: 20, maxQuantity: null, unitPriceMinor: 340000 }],
  },
  {
    canonicalName: 'Premium Royal Kolam Rice (50kg Bag)',
    category: 'GRAINS',
    baseUnit: 'BAG',
    packSizeDescription: '50kg Bag',
    unitsPerPack: 1,
    specifications: { material: 'Silky Kolam Rice', capacityOrSize: '50kg', foodSafe: true, grade: 'PREMIUM' },
    synonyms: ['kolam rice', 'daily rice', 'surti kolam'],
    supplierKey: 'Kisan Golden Grain Wholesalers',
    baseUnitPriceMinor: 260000,
    moq: 80,
    tiers: [{ minQuantity: 1, maxQuantity: 29, unitPriceMinor: 260000 }, { minQuantity: 30, maxQuantity: null, unitPriceMinor: 235000 }],
  },
  {
    canonicalName: 'Washed Yellow Moong Dal (30kg Bag)',
    category: 'GRAINS',
    baseUnit: 'BAG',
    packSizeDescription: '30kg Bag',
    unitsPerPack: 1,
    specifications: { material: 'Split Yellow Gram', capacityOrSize: '30kg', foodSafe: true, grade: 'GRADE_A' },
    synonyms: ['moong dal', 'dhuli moong', 'yellow lentils'],
    supplierKey: 'Kisan Golden Grain Wholesalers',
    baseUnitPriceMinor: 320000,
    moq: 60,
    tiers: [{ minQuantity: 1, maxQuantity: 19, unitPriceMinor: 320000 }, { minQuantity: 20, maxQuantity: null, unitPriceMinor: 290000 }],
  },
  {
    canonicalName: 'Unpolished Chana Dal Super Fine (30kg Bag)',
    category: 'GRAINS',
    baseUnit: 'BAG',
    packSizeDescription: '30kg Bag',
    unitsPerPack: 1,
    specifications: { material: 'Bengal Gram Dal', capacityOrSize: '30kg', foodSafe: true, grade: 'UNPOLISHED' },
    synonyms: ['chana dal', 'bengal gram', 'split chickpeas'],
    supplierKey: 'Kisan Golden Grain Wholesalers',
    baseUnitPriceMinor: 225000,
    moq: 70,
    tiers: [{ minQuantity: 1, maxQuantity: 24, unitPriceMinor: 225000 }, { minQuantity: 25, maxQuantity: null, unitPriceMinor: 205000 }],
  },
  {
    canonicalName: 'Jumbo Kabuli Chickpeas / Chana (25kg Bag)',
    category: 'GRAINS',
    baseUnit: 'BAG',
    packSizeDescription: '25kg Bag',
    unitsPerPack: 1,
    specifications: { material: 'White Garbanzo Beans 12mm', capacityOrSize: '25kg', foodSafe: true, grade: 'JUMBO' },
    synonyms: ['kabuli chana', 'chole chana', 'white chickpeas'],
    supplierKey: 'Kisan Golden Grain Wholesalers',
    baseUnitPriceMinor: 310000,
    moq: 50,
    tiers: [{ minQuantity: 1, maxQuantity: 19, unitPriceMinor: 310000 }, { minQuantity: 20, maxQuantity: null, unitPriceMinor: 280000 }],
  },
  {
    canonicalName: 'Premium Kashmiri Red Rajma (25kg Bag)',
    category: 'GRAINS',
    baseUnit: 'BAG',
    packSizeDescription: '25kg Bag',
    unitsPerPack: 1,
    specifications: { material: 'Red Kidney Beans', capacityOrSize: '25kg', foodSafe: true, grade: 'A_GRADE' },
    synonyms: ['rajma', 'red kidney beans', 'kashmiri rajma'],
    supplierKey: 'Kisan Golden Grain Wholesalers',
    baseUnitPriceMinor: 345000,
    moq: 50,
    tiers: [{ minQuantity: 1, maxQuantity: 19, unitPriceMinor: 345000 }, { minQuantity: 20, maxQuantity: null, unitPriceMinor: 315000 }],
  },
  {
    canonicalName: 'Organic Black Urad Whole Dal (30kg Bag)',
    category: 'GRAINS',
    baseUnit: 'BAG',
    packSizeDescription: '30kg Bag',
    unitsPerPack: 1,
    specifications: { material: 'Whole Black Gram with Husk', capacityOrSize: '30kg', foodSafe: true, grade: 'DAL_MAKHANI_GRADE' },
    synonyms: ['urad sabut', 'black gram', 'makhani dal'],
    supplierKey: 'Kisan Golden Grain Wholesalers',
    baseUnitPriceMinor: 360000,
    moq: 40,
    tiers: [{ minQuantity: 1, maxQuantity: 14, unitPriceMinor: 360000 }, { minQuantity: 15, maxQuantity: null, unitPriceMinor: 325000 }],
  },

  // ── 4. CLEANING (Commercial Cleaning & Hygiene) ──────────────────────────────
  {
    canonicalName: 'Commercial Food Grade Surface Sanitizer (5L Can)',
    category: 'CLEANING',
    baseUnit: 'CAN',
    packSizeDescription: '5 Litre Heavy Can',
    unitsPerPack: 1,
    specifications: { material: 'Quaternary Ammonium 70% IPA', capacityOrSize: '5 Litres', foodSafe: true, certifications: ['ISO-9001', 'FSSAI'], grade: 'COMMERCIAL_SANITIZER' },
    synonyms: ['sanitizer', 'surface disinfectant', 'kitchen cleaner'],
    supplierKey: 'HygienePro Chemicals',
    baseUnitPriceMinor: 62000,
    moq: 300,
    minRetailerQuantity: 10,
    step: 2,
    tiers: [{ minQuantity: 1, maxQuantity: 49, unitPriceMinor: 62000 }, { minQuantity: 50, maxQuantity: 149, unitPriceMinor: 54000 }, { minQuantity: 150, maxQuantity: null, unitPriceMinor: 46000 }],
    isPartialPool: true,
    partialPoolKey: 'AKD-POOL-CLN-01',
    partialContributions: [
      { shopKey: 'bakeryb@demo.aapkidukan.in', quantity: 80, unitPriceMinor: 46000 },
      { shopKey: 'bistroc@demo.aapkidukan.in', quantity: 70, unitPriceMinor: 46000 },
    ],
  },
  {
    canonicalName: 'Concentrated Heavy-Duty Dishwash Liquid (5L Can)',
    category: 'CLEANING',
    baseUnit: 'CAN',
    packSizeDescription: '5 Litre Can',
    unitsPerPack: 1,
    specifications: { material: 'Lemon Degreaser Active Surfactant', capacityOrSize: '5 Litres', foodSafe: true, grade: 'RESTAURANT_GRADE' },
    synonyms: ['dishwash gel', 'dishwashing liquid', 'bartan liquid'],
    supplierKey: 'HygienePro Chemicals',
    baseUnitPriceMinor: 48000,
    moq: 250,
    minRetailerQuantity: 10,
    step: 5,
    tiers: [{ minQuantity: 1, maxQuantity: 49, unitPriceMinor: 48000 }, { minQuantity: 50, maxQuantity: 119, unitPriceMinor: 41000 }, { minQuantity: 120, maxQuantity: null, unitPriceMinor: 35000 }],
    isPartialPool: true,
    partialPoolKey: 'AKD-POOL-CLN-02',
    partialContributions: [
      { shopKey: 'bakeryb@demo.aapkidukan.in', quantity: 75, unitPriceMinor: 35000 },
      { shopKey: 'bistroc@demo.aapkidukan.in', quantity: 50, unitPriceMinor: 35000 },
    ],
  },
  {
    canonicalName: 'Commercial Pine Floor Disinfectant Cleaner (5L Can)',
    category: 'CLEANING',
    baseUnit: 'CAN',
    packSizeDescription: '5 Litre Can',
    unitsPerPack: 1,
    specifications: { material: 'Natural Pine Disinfectant', capacityOrSize: '5 Litres', foodSafe: false, grade: 'HOSPITALITY' },
    synonyms: ['floor cleaner', 'pine disinfectant', 'phenyl cleaner'],
    supplierKey: 'HygienePro Chemicals',
    baseUnitPriceMinor: 39000,
    moq: 100,
    tiers: [{ minQuantity: 1, maxQuantity: 29, unitPriceMinor: 39000 }, { minQuantity: 30, maxQuantity: null, unitPriceMinor: 33000 }],
  },
  {
    canonicalName: 'Industrial Antibacterial Liquid Handwash (5L Can)',
    category: 'CLEANING',
    baseUnit: 'CAN',
    packSizeDescription: '5 Litre Can',
    unitsPerPack: 1,
    specifications: { material: 'Moisturizing Neem & Aloe', capacityOrSize: '5 Litres', foodSafe: true, grade: 'DERMA_SAFE' },
    synonyms: ['handwash', 'liquid soap', 'bulk handwash'],
    supplierKey: 'HygienePro Chemicals',
    baseUnitPriceMinor: 44000,
    moq: 80,
    tiers: [{ minQuantity: 1, maxQuantity: 24, unitPriceMinor: 44000 }, { minQuantity: 25, maxQuantity: null, unitPriceMinor: 38000 }],
  },
  {
    canonicalName: 'Extra Thick Commercial Microfiber Towels (Pack of 50)',
    category: 'CLEANING',
    baseUnit: 'PACK',
    packSizeDescription: '50 towels / pack',
    unitsPerPack: 50,
    specifications: { material: '400 GSM Plush Microfiber', capacityOrSize: '40x40 cm', foodSafe: true, grade: 'COMMERCIAL' },
    synonyms: ['microfiber duster', 'cleaning cloth', 'wiper towel'],
    supplierKey: 'HygienePro Chemicals',
    baseUnitPriceMinor: 95000,
    moq: 40,
    tiers: [{ minQuantity: 1, maxQuantity: 14, unitPriceMinor: 95000 }, { minQuantity: 15, maxQuantity: null, unitPriceMinor: 82000 }],
  },
  {
    canonicalName: 'Heavy Duty Commercial Degreaser & Oven Cleaner (5L Can)',
    category: 'CLEANING',
    baseUnit: 'CAN',
    packSizeDescription: '5 Litre Heavy Can',
    unitsPerPack: 1,
    specifications: { material: 'Alkaline Fast Acting Formula', capacityOrSize: '5 Litres', foodSafe: false, grade: 'INDUSTRIAL' },
    synonyms: ['degreaser', 'chimney cleaner', 'oven cleaner'],
    supplierKey: 'HygienePro Chemicals',
    baseUnitPriceMinor: 74000,
    moq: 50,
    tiers: [{ minQuantity: 1, maxQuantity: 19, unitPriceMinor: 74000 }, { minQuantity: 20, maxQuantity: null, unitPriceMinor: 65000 }],
  },
  {
    canonicalName: 'High Capacity Black Garbage Bags 50 Gallon (Roll of 200)',
    category: 'CLEANING',
    baseUnit: 'ROLL',
    packSizeDescription: '200 bags / roll',
    unitsPerPack: 200,
    specifications: { material: 'Virgin HDPE 40 Micron', capacityOrSize: '50 Gallon / 36x48 inch', foodSafe: false, grade: 'EXTRA_HEAVY' },
    synonyms: ['garbage bags', 'trash liners', 'dustbin covers'],
    supplierKey: 'GreenPack Industries',
    baseUnitPriceMinor: 82000,
    moq: 60,
    tiers: [{ minQuantity: 1, maxQuantity: 19, unitPriceMinor: 82000 }, { minQuantity: 20, maxQuantity: null, unitPriceMinor: 72000 }],
  },
  {
    canonicalName: 'Stainless Steel Heavy Commercial Pot Scrubbers (Pack of 100)',
    category: 'CLEANING',
    baseUnit: 'PACK',
    packSizeDescription: '100 scrubbers / pack',
    unitsPerPack: 100,
    specifications: { material: '410 Stainless Steel Wire Mesh', capacityOrSize: '50g Extra Large', foodSafe: true, grade: 'RUST_PROOF' },
    synonyms: ['steel scrubber', 'metal scrubber', 'bartan scrubber'],
    supplierKey: 'SteelCraft Kitchenware Ltd',
    baseUnitPriceMinor: 78000,
    moq: 50,
    tiers: [{ minQuantity: 1, maxQuantity: 19, unitPriceMinor: 78000 }, { minQuantity: 20, maxQuantity: null, unitPriceMinor: 68000 }],
  },
  {
    canonicalName: 'High Chlorine Bleaching Powder (25kg Drum)',
    category: 'CLEANING',
    baseUnit: 'DRUM',
    packSizeDescription: '25kg Sealed HDPE Drum',
    unitsPerPack: 1,
    specifications: { material: 'Calcium Hypochlorite 35% Stable', capacityOrSize: '25kg', foodSafe: false, grade: 'DISINFECTANT' },
    synonyms: ['bleach powder', 'chlorine', 'sanitation powder'],
    supplierKey: 'HygienePro Chemicals',
    baseUnitPriceMinor: 110000,
    moq: 30,
    tiers: [{ minQuantity: 1, maxQuantity: 9, unitPriceMinor: 110000 }, { minQuantity: 10, maxQuantity: null, unitPriceMinor: 96000 }],
  },
  {
    canonicalName: 'Commercial Aerosol Room Air Freshener Refills (Pack of 12)',
    category: 'CLEANING',
    baseUnit: 'PACK',
    packSizeDescription: '12 cans / pack',
    unitsPerPack: 12,
    specifications: { material: 'Essential Oil Mist 3000 Sprays', capacityOrSize: '250ml per can', foodSafe: false, grade: 'AUTOMATIC_DISPENSER' },
    synonyms: ['air freshener', 'room spray', 'lavender refill'],
    supplierKey: 'HygienePro Chemicals',
    baseUnitPriceMinor: 125000,
    moq: 30,
    tiers: [{ minQuantity: 1, maxQuantity: 9, unitPriceMinor: 125000 }, { minQuantity: 10, maxQuantity: null, unitPriceMinor: 110000 }],
  },

  // ── 5. SPICES (Spices & Condiments) ─────────────────────────────────────────
  {
    canonicalName: 'Organic Turmeric Finger Polished (25kg Sack)',
    category: 'SPICES',
    baseUnit: 'SACK',
    packSizeDescription: '25kg Jute Sack',
    unitsPerPack: 1,
    specifications: { material: 'Salem Pure Turmeric Rhizome', capacityOrSize: '25kg', foodSafe: true, certifications: ['FSSAI', 'AGMARK'], grade: 'HIGH_CURCUMIN_4PCT' },
    synonyms: ['haldi finger', 'turmeric whole', 'salem haldi'],
    supplierKey: 'Vedic Spices Consortium',
    baseUnitPriceMinor: 340000,
    moq: 100,
    minRetailerQuantity: 4,
    step: 1,
    tiers: [{ minQuantity: 1, maxQuantity: 19, unitPriceMinor: 340000 }, { minQuantity: 20, maxQuantity: 49, unitPriceMinor: 310000 }, { minQuantity: 50, maxQuantity: null, unitPriceMinor: 275000 }],
    isPartialPool: true,
    partialPoolKey: 'AKD-POOL-SPC-01',
    partialContributions: [
      { shopKey: 'bakeryb@demo.aapkidukan.in', quantity: 30, unitPriceMinor: 275000 },
      { shopKey: 'bistroc@demo.aapkidukan.in', quantity: 25, unitPriceMinor: 275000 },
    ],
  },
  {
    canonicalName: 'Guntur Stemless Red Chilli Whole (20kg Sack)',
    category: 'SPICES',
    baseUnit: 'SACK',
    packSizeDescription: '20kg Sack',
    unitsPerPack: 1,
    specifications: { material: 'Guntur S4 Stemless Hot Chilli', capacityOrSize: '20kg', foodSafe: true, certifications: ['AGMARK'], grade: 'EXPORT_QUALITY' },
    synonyms: ['red chilli', 'lal mirch', 'guntur mirch', 'whole chilli'],
    supplierKey: 'Vedic Spices Consortium',
    baseUnitPriceMinor: 420000,
    moq: 120,
    minRetailerQuantity: 5,
    step: 1,
    tiers: [{ minQuantity: 1, maxQuantity: 29, unitPriceMinor: 420000 }, { minQuantity: 30, maxQuantity: 79, unitPriceMinor: 380000 }, { minQuantity: 80, maxQuantity: null, unitPriceMinor: 340000 }],
    isPartialPool: true,
    partialPoolKey: 'AKD-POOL-SPC-02',
    partialContributions: [
      { shopKey: 'bakeryb@demo.aapkidukan.in', quantity: 35, unitPriceMinor: 340000 },
      { shopKey: 'bistroc@demo.aapkidukan.in', quantity: 20, unitPriceMinor: 340000 },
    ],
  },
  {
    canonicalName: 'Unpolished Whole Coriander Seeds / Dhaniya (20kg Sack)',
    category: 'SPICES',
    baseUnit: 'SACK',
    packSizeDescription: '20kg Sack',
    unitsPerPack: 1,
    specifications: { material: 'Green Bold Coriander Seeds', capacityOrSize: '20kg', foodSafe: true, grade: 'EAGLE_SUPER' },
    synonyms: ['dhaniya sabut', 'coriander whole', 'green dhaniya'],
    supplierKey: 'Vedic Spices Consortium',
    baseUnitPriceMinor: 230000,
    moq: 60,
    tiers: [{ minQuantity: 1, maxQuantity: 19, unitPriceMinor: 230000 }, { minQuantity: 20, maxQuantity: null, unitPriceMinor: 205000 }],
  },
  {
    canonicalName: 'Premium Machine-Cleaned Cumin Seeds / Jeera (25kg Sack)',
    category: 'SPICES',
    baseUnit: 'SACK',
    packSizeDescription: '25kg Sack',
    unitsPerPack: 1,
    specifications: { material: 'Unjha Premium Cumin Seeds', capacityOrSize: '25kg', foodSafe: true, grade: '99PCT_CLEAN' },
    synonyms: ['jeera', 'cumin whole', 'unjha jeera'],
    supplierKey: 'Vedic Spices Consortium',
    baseUnitPriceMinor: 740000,
    moq: 40,
    tiers: [{ minQuantity: 1, maxQuantity: 14, unitPriceMinor: 740000 }, { minQuantity: 15, maxQuantity: null, unitPriceMinor: 670000 }],
  },
  {
    canonicalName: 'Bold Black Mustard Seeds / Rai (25kg Sack)',
    category: 'SPICES',
    baseUnit: 'SACK',
    packSizeDescription: '25kg Sack',
    unitsPerPack: 1,
    specifications: { material: 'Clean Black Mustard Seeds', capacityOrSize: '25kg', foodSafe: true, grade: 'GRADE_1' },
    synonyms: ['sarson seed', 'rai', 'black mustard'],
    supplierKey: 'Vedic Spices Consortium',
    baseUnitPriceMinor: 210000,
    moq: 50,
    tiers: [{ minQuantity: 1, maxQuantity: 19, unitPriceMinor: 210000 }, { minQuantity: 20, maxQuantity: null, unitPriceMinor: 185000 }],
  },
  {
    canonicalName: 'Tellicherry Bold Black Peppercorns (10kg Bag)',
    category: 'SPICES',
    baseUnit: 'BAG',
    packSizeDescription: '10kg Bag',
    unitsPerPack: 1,
    specifications: { material: 'Malabar Black Pepper 550g/L', capacityOrSize: '10kg', foodSafe: true, grade: 'TELLICHERRY_EXTRA_BOLD' },
    synonyms: ['kali mirch', 'black pepper', 'peppercorns'],
    supplierKey: 'Vedic Spices Consortium',
    baseUnitPriceMinor: 620000,
    moq: 30,
    tiers: [{ minQuantity: 1, maxQuantity: 9, unitPriceMinor: 620000 }, { minQuantity: 10, maxQuantity: null, unitPriceMinor: 560000 }],
  },
  {
    canonicalName: 'Premium 8mm Green Cardamom Pods (5kg Carton)',
    category: 'SPICES',
    baseUnit: 'CARTON',
    packSizeDescription: '5kg Sealed Carton',
    unitsPerPack: 1,
    specifications: { material: 'Idukki Green Cardamom 8mm+', capacityOrSize: '5kg', foodSafe: true, grade: 'A_GRADE_JUMBO' },
    synonyms: ['chhoti elaichi', 'green cardamom', 'cardamom'],
    supplierKey: 'Vedic Spices Consortium',
    baseUnitPriceMinor: 1150000,
    moq: 20,
    tiers: [{ minQuantity: 1, maxQuantity: 5, unitPriceMinor: 1150000 }, { minQuantity: 6, maxQuantity: null, unitPriceMinor: 1020000 }],
  },
  {
    canonicalName: 'Selected Madagascar Whole Cloves / Laung (10kg Bag)',
    category: 'SPICES',
    baseUnit: 'BAG',
    packSizeDescription: '10kg Bag',
    unitsPerPack: 1,
    specifications: { material: 'Lal Pari Cloves Hand Picked', capacityOrSize: '10kg', foodSafe: true, grade: 'HEADED_PRIME' },
    synonyms: ['laung', 'cloves', 'whole cloves'],
    supplierKey: 'Vedic Spices Consortium',
    baseUnitPriceMinor: 790000,
    moq: 25,
    tiers: [{ minQuantity: 1, maxQuantity: 9, unitPriceMinor: 790000 }, { minQuantity: 10, maxQuantity: null, unitPriceMinor: 710000 }],
  },
  {
    canonicalName: 'Master Chef Commercial Garam Masala Blend (10kg Bucket)',
    category: 'SPICES',
    baseUnit: 'BUCKET',
    packSizeDescription: '10kg Food Grade Bucket',
    unitsPerPack: 1,
    specifications: { material: '16 Whole Spices Roasted Blend', capacityOrSize: '10kg', foodSafe: true, grade: 'CULINARY_CHEF' },
    synonyms: ['garam masala', 'chef masala', 'blend spices'],
    supplierKey: 'Vedic Spices Consortium',
    baseUnitPriceMinor: 380000,
    moq: 30,
    tiers: [{ minQuantity: 1, maxQuantity: 9, unitPriceMinor: 380000 }, { minQuantity: 10, maxQuantity: null, unitPriceMinor: 340000 }],
  },
  {
    canonicalName: 'Pure Himalayan Natural Pink Rock Salt Granules (50kg Sack)',
    category: 'SPICES',
    baseUnit: 'SACK',
    packSizeDescription: '50kg Woven Sack',
    unitsPerPack: 1,
    specifications: { material: '100% Himalayan Mineral Salt', capacityOrSize: '50kg', foodSafe: true, grade: 'FOOD_GRADE' },
    synonyms: ['sendha namak', 'pink salt', 'rock salt'],
    supplierKey: 'Vedic Spices Consortium',
    baseUnitPriceMinor: 145000,
    moq: 50,
    tiers: [{ minQuantity: 1, maxQuantity: 19, unitPriceMinor: 145000 }, { minQuantity: 20, maxQuantity: null, unitPriceMinor: 125000 }],
  },

  // ── 6. KITCHEN (Commercial Kitchen Supplies) ─────────────────────────────────
  {
    canonicalName: 'Stainless Steel Commercial Tea Strainers (Dozen)',
    category: 'KITCHEN',
    baseUnit: 'DOZEN',
    packSizeDescription: '12 Strainers / Box',
    unitsPerPack: 12,
    specifications: { material: 'SS 304 Double Fine Mesh', capacityOrSize: '10cm Diameter', foodSafe: true, grade: 'CHAI_STALL_HEAVY' },
    synonyms: ['tea strainer', 'chai chalni', 'ss chalni', 'mesh strainer'],
    supplierKey: 'SteelCraft Kitchenware Ltd',
    baseUnitPriceMinor: 48000,
    moq: 150,
    minRetailerQuantity: 5,
    step: 1,
    tiers: [{ minQuantity: 1, maxQuantity: 29, unitPriceMinor: 48000 }, { minQuantity: 30, maxQuantity: 79, unitPriceMinor: 42000 }, { minQuantity: 80, maxQuantity: null, unitPriceMinor: 36000 }],
    isPartialPool: true,
    partialPoolKey: 'AKD-POOL-KIT-01',
    partialContributions: [
      { shopKey: 'bakeryb@demo.aapkidukan.in', quantity: 45, unitPriceMinor: 36000 },
      { shopKey: 'bistroc@demo.aapkidukan.in', quantity: 35, unitPriceMinor: 36000 },
    ],
  },
  {
    canonicalName: 'Gastronorm GN Pan 1/1 100mm Stainless Steel',
    category: 'KITCHEN',
    baseUnit: 'UNIT',
    packSizeDescription: 'Individual GN Pan',
    unitsPerPack: 1,
    specifications: { material: 'SS 304 0.8mm Gauge', capacityOrSize: 'GN 1/1 14 Litres 100mm', foodSafe: true, grade: 'HOTEL_BUFFET' },
    synonyms: ['gn pan', 'hotel tray', 'buffet pan', 'chafing dish insert'],
    supplierKey: 'SteelCraft Kitchenware Ltd',
    baseUnitPriceMinor: 98000,
    moq: 100,
    minRetailerQuantity: 5,
    step: 1,
    tiers: [{ minQuantity: 1, maxQuantity: 19, unitPriceMinor: 98000 }, { minQuantity: 20, maxQuantity: 49, unitPriceMinor: 86000 }, { minQuantity: 50, maxQuantity: null, unitPriceMinor: 75000 }],
    isPartialPool: true,
    partialPoolKey: 'AKD-POOL-KIT-02',
    partialContributions: [
      { shopKey: 'bakeryb@demo.aapkidukan.in', quantity: 25, unitPriceMinor: 75000 },
      { shopKey: 'bistroc@demo.aapkidukan.in', quantity: 25, unitPriceMinor: 75000 },
    ],
  },
  {
    canonicalName: 'Heavy Iron Commercial Kadai 24 Inch (Heavy Gauge)',
    category: 'KITCHEN',
    baseUnit: 'UNIT',
    packSizeDescription: '1 Kadai with Riveted Handles',
    unitsPerPack: 1,
    specifications: { material: '5mm Hand Forged Black Iron', capacityOrSize: '24 Inch / 25 Litres', foodSafe: true, grade: 'COMMERCIAL_HALWAI' },
    synonyms: ['kadai', 'iron kadai', 'halwai kadai', 'deep fry pan'],
    supplierKey: 'SteelCraft Kitchenware Ltd',
    baseUnitPriceMinor: 185000,
    moq: 20,
    tiers: [{ minQuantity: 1, maxQuantity: 4, unitPriceMinor: 185000 }, { minQuantity: 5, maxQuantity: null, unitPriceMinor: 165000 }],
  },
  {
    canonicalName: 'Commercial Aluminium Pressure Cooker 20L',
    category: 'KITCHEN',
    baseUnit: 'UNIT',
    packSizeDescription: '20L Cooker with Dual Safety Valve',
    unitsPerPack: 1,
    specifications: { material: 'Virgin Heavy Hard Aluminium', capacityOrSize: '20 Litres', foodSafe: true, certifications: ['ISI'], grade: 'ISI_CERTIFIED' },
    synonyms: ['pressure cooker', 'big cooker', 'commercial cooker'],
    supplierKey: 'SteelCraft Kitchenware Ltd',
    baseUnitPriceMinor: 320000,
    moq: 15,
    tiers: [{ minQuantity: 1, maxQuantity: 4, unitPriceMinor: 320000 }, { minQuantity: 5, maxQuantity: null, unitPriceMinor: 285000 }],
  },
  {
    canonicalName: 'Commercial Heavy Stainless Steel Idli Steamer 54 Idli',
    category: 'KITCHEN',
    baseUnit: 'UNIT',
    packSizeDescription: 'Steamer Box with 6 Trays (54 Idli)',
    unitsPerPack: 1,
    specifications: { material: 'SS 304 Heavy Gauge', capacityOrSize: '54 Cavity / 6 Tier', foodSafe: true, grade: 'RESTAURANT' },
    synonyms: ['idli steamer', 'idli cooker', 'commercial idli maker'],
    supplierKey: 'SteelCraft Kitchenware Ltd',
    baseUnitPriceMinor: 460000,
    moq: 10,
    tiers: [{ minQuantity: 1, maxQuantity: 2, unitPriceMinor: 460000 }, { minQuantity: 3, maxQuantity: null, unitPriceMinor: 410000 }],
  },
  {
    canonicalName: 'Cast Iron Heavy Duty Dosa Tawa 18 Inch',
    category: 'KITCHEN',
    baseUnit: 'UNIT',
    packSizeDescription: 'Pre-seasoned Round Tawa',
    unitsPerPack: 1,
    specifications: { material: 'Pre-Seasoned Heavy Cast Iron 6mm', capacityOrSize: '18 Inch Diameter', foodSafe: true, grade: 'COMMERCIAL' },
    synonyms: ['dosa tawa', 'cast iron tawa', 'hotel tawa'],
    supplierKey: 'SteelCraft Kitchenware Ltd',
    baseUnitPriceMinor: 165000,
    moq: 25,
    tiers: [{ minQuantity: 1, maxQuantity: 9, unitPriceMinor: 165000 }, { minQuantity: 10, maxQuantity: null, unitPriceMinor: 145000 }],
  },
  {
    canonicalName: 'Heavy Duty Brass Tadka Pan Set (Pack of 3)',
    category: 'KITCHEN',
    baseUnit: 'PACK',
    packSizeDescription: 'Set of 3 (Sizes S, M, L)',
    unitsPerPack: 3,
    specifications: { material: 'Pure Heavy Brass with Tin Coating (Kalai)', capacityOrSize: 'Set of 3', foodSafe: true, grade: 'AUTHENTIC' },
    synonyms: ['tadka pan', 'vaghar pan', 'brass pan'],
    supplierKey: 'SteelCraft Kitchenware Ltd',
    baseUnitPriceMinor: 142000,
    moq: 20,
    tiers: [{ minQuantity: 1, maxQuantity: 9, unitPriceMinor: 142000 }, { minQuantity: 10, maxQuantity: null, unitPriceMinor: 125000 }],
  },
  {
    canonicalName: 'Commercial Stainless Steel Deep Mixing Bowls Set (Pack of 6)',
    category: 'KITCHEN',
    baseUnit: 'PACK',
    packSizeDescription: 'Pack of 6 Stackable Bowls',
    unitsPerPack: 6,
    specifications: { material: 'SS 202 Mirror Polish', capacityOrSize: '2L, 3L, 4L, 5L, 7L, 10L', foodSafe: true, grade: 'STANDARD' },
    synonyms: ['mixing bowls', 'ss tasla', 'kitchen bowls'],
    supplierKey: 'SteelCraft Kitchenware Ltd',
    baseUnitPriceMinor: 155000,
    moq: 20,
    tiers: [{ minQuantity: 1, maxQuantity: 9, unitPriceMinor: 155000 }, { minQuantity: 10, maxQuantity: null, unitPriceMinor: 138000 }],
  },
  {
    canonicalName: 'High Carbon Stainless Steel Chef Knives 8 Inch (Pack of 6)',
    category: 'KITCHEN',
    baseUnit: 'PACK',
    packSizeDescription: 'Pack of 6 Chef Knives with Sheaths',
    unitsPerPack: 6,
    specifications: { material: 'High Carbon German SS 1.4116', capacityOrSize: '8 Inch Blade Full Tang', foodSafe: true, grade: 'PRO_KITCHEN' },
    synonyms: ['chef knife', 'kitchen knives', 'chopping knife'],
    supplierKey: 'SteelCraft Kitchenware Ltd',
    baseUnitPriceMinor: 175000,
    moq: 20,
    tiers: [{ minQuantity: 1, maxQuantity: 9, unitPriceMinor: 175000 }, { minQuantity: 10, maxQuantity: null, unitPriceMinor: 150000 }],
  },
  {
    canonicalName: 'High Precision Commercial Digital Weighing Scale 30kg',
    category: 'KITCHEN',
    baseUnit: 'UNIT',
    packSizeDescription: 'Electronic Scale with Dual LED Display',
    unitsPerPack: 1,
    specifications: { material: 'SS Platter with ABS Body', capacityOrSize: '30kg Capacity / 1g Accuracy', foodSafe: true, certifications: ['LEGAL_METROLOGY'], grade: 'LEGAL_METROLOGY_STAMPED' },
    synonyms: ['weighing scale', 'weight machine', 'electronic balance'],
    supplierKey: 'SteelCraft Kitchenware Ltd',
    baseUnitPriceMinor: 240000,
    moq: 15,
    tiers: [{ minQuantity: 1, maxQuantity: 4, unitPriceMinor: 240000 }, { minQuantity: 5, maxQuantity: null, unitPriceMinor: 210000 }],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SUPPLIERS TO SEED
// ─────────────────────────────────────────────────────────────────────────────
const SUPPLIERS_DATA = [
  {
    name: 'Apex Packaging Ltd',
    legalBusinessName: 'Apex Packaging Solutions Pvt Ltd',
    serviceAreas: ['LUCKNOW', 'KANPUR', 'VARANASI', 'DELHI_NCR'],
    contactEmail: 'wholesaler1@example.com',
    contactPhone: '+919876543201',
    address: 'Plot 42, Transport Nagar Hub, Lucknow 226012',
    rating: 4.9,
    fulfillmentRate: '99.4%',
  },
  {
    name: 'Bharat Agro Mills',
    legalBusinessName: 'Bharat Agro Processing & Refining Mills Ltd',
    serviceAreas: ['LUCKNOW', 'KANPUR', 'AGRA', 'NOIDA', 'SITAPUR'],
    contactEmail: 'wholesaler2@example.com',
    contactPhone: '+919876543202',
    address: 'Sitapur Agro Corridor, Highway 24, Lucknow Outskirts',
    rating: 4.8,
    fulfillmentRate: '98.9%',
  },
  {
    name: 'Kisan Golden Grain Wholesalers',
    legalBusinessName: 'Kisan Golden Grain Consortium LLP',
    serviceAreas: ['LUCKNOW', 'KANPUR', 'VARANASI', 'ALL_INDIA'],
    contactEmail: 'grains@demo.aapkidukan.in',
    contactPhone: '+919876543203',
    address: 'Mandi Samiti Yard A-12, Dubagga, Lucknow 226003',
    rating: 4.7,
    fulfillmentRate: '99.1%',
  },
  {
    name: 'HygienePro Chemicals',
    legalBusinessName: 'HygienePro Industrial Chemical Formulations Pvt Ltd',
    serviceAreas: ['LUCKNOW', 'KANPUR', 'AGRA', 'DELHI_NCR'],
    contactEmail: 'hygiene@demo.aapkidukan.in',
    contactPhone: '+919876543204',
    address: 'Industrial Area Phase 2, Sarojini Nagar, Lucknow 226008',
    rating: 4.9,
    fulfillmentRate: '99.6%',
  },
  {
    name: 'Vedic Spices Consortium',
    legalBusinessName: 'Vedic Spices & Agro Commodities Ltd',
    serviceAreas: ['LUCKNOW', 'KANPUR', 'DELHI_NCR', 'ALL_INDIA'],
    contactEmail: 'spices@demo.aapkidukan.in',
    contactPhone: '+919876543205',
    address: 'Spices Complex, Aishbagh Goods Shed, Lucknow 226004',
    rating: 4.8,
    fulfillmentRate: '98.7%',
  },
  {
    name: 'SteelCraft Kitchenware Ltd',
    legalBusinessName: 'SteelCraft Commercial Kitchenware Industries LLP',
    serviceAreas: ['LUCKNOW', 'KANPUR', 'ALL_INDIA'],
    contactEmail: 'kitchen@demo.aapkidukan.in',
    contactPhone: '+919876543206',
    address: 'Engineering Park, Talkatora Industrial Estate, Lucknow 226011',
    rating: 4.6,
    fulfillmentRate: '98.2%',
  },
  {
    name: 'GreenPack Industries',
    legalBusinessName: 'GreenPack Eco Industries Pvt Ltd',
    serviceAreas: ['KANPUR', 'LUCKNOW', 'DELHI_NCR'],
    contactEmail: 'greenpack@demo.aapkidukan.in',
    contactPhone: '+919876543207',
    address: 'Panki Industrial Area Site 3, Kanpur 208022',
    rating: 4.9,
    fulfillmentRate: '99.7%',
  },
  {
    name: 'Om Packaging Solutions',
    legalBusinessName: 'Om Packaging Corrugated Boxes LLP',
    serviceAreas: ['LUCKNOW', 'KANPUR', 'ALL_INDIA'],
    contactEmail: 'ompack@demo.aapkidukan.in',
    contactPhone: '+919876543208',
    address: 'Chinhat Industrial Area, Deva Road, Lucknow 226028',
    rating: 4.8,
    fulfillmentRate: '99.0%',
  },
];

async function seedMasterData() {
  console.log('🚀 Starting CoBuy AI Master Database Seeder (SAH-10 & Full Catalogue)...');
  await connectDB();
  clockService.reset();

  // Clean previous demo pools and derived state idempotently
  await GroupBuyPool.deleteMany({});
  await Contribution.deleteMany({});
  await Payment.deleteMany({});
  await PriceSnapshot.deleteMany({});
  await Order.deleteMany({});
  await SupplierSettlement.deleteMany({});
  await Refund.deleteMany({});

  // ── 1. Create Wholesaler Suppliers ──────────────────────────────────────────
  console.log('🏭 Seeding Wholesaler Suppliers...');
  const supplierMap = {};

  for (const s of SUPPLIERS_DATA) {
    let supp = await Supplier.findOne({ name: s.name });
    if (!supp) {
      supp = await Supplier.create({
        name: s.name,
        legalBusinessName: s.legalBusinessName,
        serviceAreas: s.serviceAreas,
        verificationStatus: 'VERIFIED',
        dataSourceType: 'SEEDED_DEMO',
        contactEmail: s.contactEmail,
        contactPhone: s.contactPhone,
        isActive: true,
        tradeTerms: {
          paymentTermsDays: 7,
          cancellationPolicyDays: 2,
        },
      });
    }
    supplierMap[s.name] = supp;
  }

  // Also maintain backward-compatible aliases for test suites:
  let supplier1 = supplierMap['Apex Packaging Ltd'];
  let legacySupplier1 = await Supplier.findOne({ name: 'North India EcoPack Wholesalers' });
  if (!legacySupplier1) {
    legacySupplier1 = await Supplier.create({
      name: 'North India EcoPack Wholesalers',
      legalBusinessName: 'North India EcoPack Wholesalers Pvt Ltd',
      serviceAreas: ['LUCKNOW', 'KANPUR', 'VARANASI', 'DELHI_NCR'],
      verificationStatus: 'VERIFIED',
      dataSourceType: 'SEEDED_DEMO',
      contactEmail: 'wholesaler1@example.com',
      contactPhone: '+919876543201',
      isActive: true,
      tradeTerms: { paymentTermsDays: 7, cancellationPolicyDays: 2 },
    });
  }

  let legacySupplier2 = await Supplier.findOne({ name: 'Ganga FMCG Bulk Distributors' });
  if (!legacySupplier2) {
    legacySupplier2 = await Supplier.create({
      name: 'Ganga FMCG Bulk Distributors',
      legalBusinessName: 'Ganga FMCG Distributors LLP',
      serviceAreas: ['LUCKNOW', 'KANPUR', 'AGRA', 'NOIDA'],
      verificationStatus: 'VERIFIED',
      dataSourceType: 'SEEDED_DEMO',
      contactEmail: 'wholesaler2@example.com',
      contactPhone: '+919876543202',
      isActive: true,
      tradeTerms: { paymentTermsDays: 14, cancellationPolicyDays: 3 },
    });
  }

  // ── 2. Create Products & SupplierOffers ──────────────────────────────────────
  console.log('📦 Seeding 60 Master Products & Offers...');
  const productMap = {};
  const offerMap = {};

  for (const item of CATALOGUE_PRODUCTS) {
    let prod = await Product.findOne({ canonicalName: item.canonicalName });
    if (!prod) {
      prod = await Product.create({
        canonicalName: item.canonicalName,
        category: item.category,
        baseUnit: item.baseUnit,
        packSizeDescription: item.packSizeDescription,
        unitsPerPack: item.unitsPerPack,
        specifications: item.specifications,
        synonyms: item.synonyms,
        brand: 'GENERIC',
        isActive: true,
      });
    }
    productMap[item.canonicalName] = prod;

    const assignedSupplier = supplierMap[item.supplierKey] || supplier1;
    let offer = await SupplierOffer.findOne({ supplierId: assignedSupplier._id, productId: prod._id });
    if (!offer) {
      offer = await SupplierOffer.create({
        supplierId: assignedSupplier._id,
        productId: prod._id,
        packUnit: item.baseUnit,
        packSize: item.packSizeDescription,
        baseUnitPriceMinor: item.baseUnitPriceMinor,
        minimumOrderQuantity: item.moq,
        retailerMoqPercentage: item.minRetailerQuantity ? Math.round((item.minRetailerQuantity / item.moq) * 100) : 20,
        retailerStepPercentage: item.step ? Math.max(1, Math.round((item.step / item.moq) * 100)) : 1,
        leadTimeDays: 3,
        quantityTiers: item.tiers,
        deliveryAreas: ['LUCKNOW', 'KANPUR', 'VARANASI', 'ALL_INDIA'],
        shippingTerms: 'EX_WORKS',
        flatShippingCostMinor: 0,
        expiresAt: new Date(Date.now() + 60 * 86400000),
        verificationStatus: 'VERIFIED',
        dataSourceType: 'SEEDED_DEMO',
        isActive: true,
      });
    }
    offerMap[item.canonicalName] = offer;
  }

  // ── 3. Create Demo Users & Linked Shops ─────────────────────────────────────
  console.log('👤 Seeding Demo Users & Shops...');
  const userSeeds = [
    { email: 'retailer1@example.com', name: 'Ramesh Sharma (Shop A)', role: 'SHOP_OWNER', shopName: 'Hazratganj Café & Stores', area: 'LUCKNOW' },
    { email: 'retailer2@example.com', name: 'Suresh Gupta (Shop B)', role: 'SHOP_OWNER', shopName: 'Gomti Nagar Kirana Mart', area: 'LUCKNOW' },
    { email: 'retailer3@example.com', name: 'Amit Verma (Shop C)', role: 'SHOP_OWNER', shopName: 'Alambagh Daily Needs', area: 'LUCKNOW' },
    { email: 'wholesaler1@example.com', name: 'Vikram Mehta (Supplier 1)', role: 'SUPPLIER', shopName: 'EcoPack Distribution Hub', area: 'LUCKNOW' },
    { email: 'wholesaler2@example.com', name: 'Rajesh Singhal (Supplier 2)', role: 'SUPPLIER', shopName: 'Ganga FMCG Depot', area: 'LUCKNOW' },
    { email: 'admin@example.com', name: 'System Administrator', role: 'ADMIN', shopName: 'Platform Ops HQ', area: 'LUCKNOW' },
    { email: 'reviewer@example.com', name: 'Compliance Reviewer', role: 'REVIEWER', shopName: 'Audit Review Room', area: 'LUCKNOW' },
    // Frontend Quick Demo Accounts
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
        passwordHash: PASSWORD_PLAIN,
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

  // Unified Primary Shop References
  const shopAUser = userMap['cafea@demo.aapkidukan.in'] || userMap['retailer1@example.com'];
  const shopAShop = shopMap['cafea@demo.aapkidukan.in'] || shopMap['retailer1@example.com'];
  const shopBUser = userMap['bakeryb@demo.aapkidukan.in'] || userMap['retailer2@example.com'];
  const shopBShop = shopMap['bakeryb@demo.aapkidukan.in'] || shopMap['retailer2@example.com'];
  const shopCUser = userMap['bistroc@demo.aapkidukan.in'] || userMap['retailer3@example.com'];
  const shopCShop = shopMap['bistroc@demo.aapkidukan.in'] || shopMap['retailer3@example.com'];

  // ── 4. Scenario 1: The Mandatory ₹4,800 Paper Cups Group Pool ────────────────
  console.log('☕ Seeding Scenario 1: Mandatory ₹4,800 Paper Cups Group Pool...');
  const cupProduct = productMap['Bio-Degradable Coffee Cups 250ml'];
  const cupOffer = offerMap['Bio-Degradable Coffee Cups 250ml'];

  const cupPool = await GroupBuyPool.create({
    title: 'Lucknow Kirana Bio-Cups Bulk Pool (₹4,800 Goal)',
    createdByUserId: shopBUser._id,
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
    participantCount: 2,
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

  const contribB = await Contribution.create({
    poolId: cupPool._id,
    shopId: shopBShop._id,
    createdByUserId: shopBUser._id,
    quantity: 35,
    unit: 'BOX',
    unitPriceMinor: 8000,
    estimatedMerchandiseShareMinor: 280000,
    finalTotalPayableMinor: 280000,
    totalPaidMinor: 280000,
    approvalStatus: 'PENDING_APPROVAL',
    state: 'ACTIVE',
  });

  const contribC = await Contribution.create({
    poolId: cupPool._id,
    shopId: shopCShop._id,
    createdByUserId: shopCUser._id,
    quantity: 25,
    unit: 'BOX',
    unitPriceMinor: 8000,
    estimatedMerchandiseShareMinor: 200000,
    finalTotalPayableMinor: 200000,
    totalPaidMinor: 200000,
    approvalStatus: 'PENDING_APPROVAL',
    state: 'ACTIVE',
  });

  const snapshot = await PriceSnapshot.create({
    poolId: cupPool._id,
    version: 1,
    supplierOfferId: cupOffer._id,
    currency: 'INR',
    totalEligibleQuantity: 60,
    baseUnitPriceMinor: 10000,
    appliedUnitPriceMinor: 8000,
    merchandiseTotalMinor: 480000,
    shippingCostMinor: 0,
    shippingStatus: 'KNOWN',
    groupTotalPayableMinor: 480000,
    memberShares: [
      {
        contributionId: contribB._id,
        shopId: contribB.shopId,
        quantity: 35,
        unit: 'BOX',
        appliedUnitPriceMinor: 8000,
        merchandiseShareMinor: 280000,
        shippingShareMinor: 0,
        roundingAdjustmentMinor: 0,
        totalPayableMinor: 280000,
        verifiedSavingsMinor: 70000,
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

  // Seed Verified Captured Payments for Scenario 1
  for (const [contrib, amount] of [
    [contribB, 280000],
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
      paymentStatus: 'PAID',
      status: 'PAID',
      paidAt: new Date(),
      isTestTransaction: true,
    });
  }

  
  // Seed Demo Tier-Drop Savings Refund for Shop B
  const paymentB = await Payment.findOne({ contributionId: contribB._id });
  if (paymentB) {
    await Refund.create({
      paymentId: paymentB._id,
      poolId: cupPool._id,
      contributionId: contribB._id,
      shopId: contribB.shopId,
      recipientUserId: contribB.createdByUserId,
      amountMinor: 28000, // ₹280 Tier-Drop bulk savings
      currency: 'INR',
      reason: 'TIER_PRICE_DROP_SAVINGS',
      providerRefundId: 'MOCK_REF_TIER_SAVINGS_' + contribB._id,
      idempotencyKey: 'SEED_REF_IDEMP_' + contribB._id,
      status: 'COMPLETED',
      isTestTransaction: true,
      metadata: {
        poolTitle: cupPool.title,
        notes: 'Tier price dropped from ₹80 to ₹72 per box on 60-box target reached.',
      },
    });
  }

  // Seed Notification
  await Notification.create({
    recipientUserId: shopBUser._id,
    shopId: shopBShop._id,
    poolId: cupPool._id,
    type: 'MOQ_REACHED_LOCKED',
    title: 'MOQ Milestone Reached: ₹4,800 Bulk Tier Unlocked!',
    message: 'The Lucknow Paper Cups Pool reached its 60-box target! Review your final snapshot terms.',
    isRead: false,
  });

  // Mark contributions as approved for version 1 snapshot
  await Contribution.updateMany(
    { poolId: cupPool._id },
    {
      approvalStatus: 'APPROVED',
      approvedPriceSnapshotId: snapshot._id,
      approvedAt: new Date(),
    }
  );

  cupPool.state = 'FUNDED';
  await cupPool.save();

  // Create Confirmed Order AKD-2026-0001
  let cupOrder = await Order.findOne({ poolId: cupPool._id });
  if (!cupOrder) {
    cupOrder = await createFinalOrderFromFundedPool(cupPool._id);
    cupOrder.supplierConfirmationStatus = 'CONFIRMED';
    cupOrder.supplierReference = 'BART-ORD-2026-001';
    cupOrder.confirmedAt = new Date();
    cupOrder.orderState = 'PROCESSING';
    await cupOrder.save();

    await SupplierSettlement.findOneAndUpdate(
      { orderId: cupOrder._id },
      { settlementStatus: 'SIMULATED', mode: 'DEMO', disclosedToBuyer: true },
      { upsert: true, new: true }
    );
  }

  // ── 5. Scenario 2: Two-Level MOQ 1000 Basmati Rice Pool ──────────────────────
  console.log('🌾 Seeding Scenario 2: 1000 MOQ Basmati Rice Pool...');
  const riceProduct = productMap['Basmati Rice Extra Long Grain 5kg'];
  const riceOffer = offerMap['Basmati Rice Extra Long Grain 5kg'];

  const ricePool = await GroupBuyPool.create({
    title: 'Lucknow Wholesale Basmati Rice Pool (1000 MOQ)',
    createdByUserId: shopAUser._id,
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

  const riceContrib = await Contribution.create({
    poolId: ricePool._id,
    shopId: shopBShop._id,
    createdByUserId: shopBUser._id,
    quantity: 200,
    unit: 'BAG',
    unitPriceMinor: 50000,
    estimatedMerchandiseShareMinor: 10000000,
    finalTotalPayableMinor: 10000000,
    totalPaidMinor: 10000000,
    state: 'ACTIVE',
  });

  await Payment.create({
    poolId: ricePool._id,
    contributionId: riceContrib._id,
    shopId: riceContrib.shopId,
    payerUserId: riceContrib.createdByUserId,
    amountMinor: 10000000,
    currency: 'INR',
    paymentPurpose: 'INITIAL_JOIN',
    provider: 'PAYPAL_SANDBOX',
    providerOrderId: `MOCK_ORDER_${riceContrib._id}`,
    providerCaptureId: `MOCK_CAP_${riceContrib._id}`,
    idempotencyKey: `SEED_IDEMP_${riceContrib._id}`,
    paymentStatus: 'PAID',
    status: 'PAID',
    paidAt: new Date(),
    isTestTransaction: true,
  });

  // ── 6. Scenario 3: Expired 72h Under-MOQ Pool (600/1000) in 24h Decision ─────
  console.log('⏰ Seeding Scenario 3: 72h Expired Under-MOQ Pool in 24h Decision Window...');
  const underMoqPool = await GroupBuyPool.create({
    title: 'Lucknow Premium Rice Pool (Under-MOQ Resolution)',
    createdByUserId: shopBUser._id,
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
    publishedAt: new Date(Date.now() - 74 * 3600000),
    deadline: new Date(Date.now() - 2 * 3600000),
    decisionDeadline: new Date(Date.now() + 22 * 3600000),
    state: 'UNDER_MOQ_DECISION_PENDING',
    lockReason: 'EXPIRED_72H_UNDER_MOQ',
    lockedAt: new Date(Date.now() - 2 * 3600000),
    supplierUnderMoqStatus: 'ACCEPTED_SUB_MOQ',
    aiUnderMoqRecommendation: {
      suggestedAction: 'PROCEED',
      explanation: 'Pool reached 600 of 1000 MOQ (60%). Supplier confirmed acceptance of sub-MOQ volume with zero unit-cost penalty.',
      supportingFigures: {
        targetMoq: 1000,
        achievedQuantity: 600,
        fulfillmentPercentage: 60,
        unitPriceIncrease: 0,
      },
      uncertainties: ['Delivery window may extend by up to 24 hours due to sub-batch pallet assembly.'],
      generatedAt: new Date(Date.now() - 2 * 3600000),
    },
    dataSourceType: 'SEEDED_DEMO',
    pricingTiers: [
      { minQuantity: 1, unitPriceMinor: 50000 },
      { minQuantity: 500, unitPriceMinor: 46000 },
      { minQuantity: 1000, unitPriceMinor: 42000 },
    ],
  });

  const underContribB = await Contribution.create({
    poolId: underMoqPool._id,
    shopId: shopBShop._id,
    createdByUserId: shopBUser._id,
    quantity: 400,
    unit: 'BAG',
    unitPriceMinor: 46000,
    estimatedMerchandiseShareMinor: 18400000,
    finalTotalPayableMinor: 18400000,
    totalPaidMinor: 18400000,
    state: 'ACTIVE',
    underMoqDecision: 'PENDING',
  });

  await Payment.create({
    poolId: underMoqPool._id,
    contributionId: underContribB._id,
    shopId: underContribB.shopId,
    payerUserId: underContribB.createdByUserId,
    amountMinor: 18400000,
    currency: 'INR',
    paymentPurpose: 'INITIAL_JOIN',
    provider: 'PAYPAL_SANDBOX',
    providerOrderId: `MOCK_ORDER_${underContribB._id}`,
    providerCaptureId: `MOCK_CAP_${underContribB._id}`,
    idempotencyKey: `SEED_IDEMP_${underContribB._id}`,
    paymentStatus: 'PAID',
    status: 'PAID',
    paidAt: new Date(),
    isTestTransaction: true,
  });

  const underContribC = await Contribution.create({
    poolId: underMoqPool._id,
    shopId: shopCShop._id,
    createdByUserId: shopCUser._id,
    quantity: 200,
    unit: 'BAG',
    unitPriceMinor: 46000,
    estimatedMerchandiseShareMinor: 9200000,
    finalTotalPayableMinor: 9200000,
    totalPaidMinor: 9200000,
    state: 'ACTIVE',
    underMoqDecision: 'PENDING',
  });

  await Payment.create({
    poolId: underMoqPool._id,
    contributionId: underContribC._id,
    shopId: underContribC.shopId,
    payerUserId: underContribC.createdByUserId,
    amountMinor: 9200000,
    currency: 'INR',
    paymentPurpose: 'INITIAL_JOIN',
    provider: 'PAYPAL_SANDBOX',
    providerOrderId: `MOCK_ORDER_${underContribC._id}`,
    providerCaptureId: `MOCK_CAP_${underContribC._id}`,
    idempotencyKey: `SEED_IDEMP_${underContribC._id}`,
    paymentStatus: 'PAID',
    status: 'PAID',
    paidAt: new Date(),
    isTestTransaction: true,
  });

  // ── 7. Scenario 4: Incompatible Requirement (Safety Block) ──────────────────
  console.log('🚫 Seeding Scenario 4: Incompatible Requirement (Polystyrene Safety Block)...');
  let badReq = await Requirement.findOne({ title: 'Non-compliant 8-oz Polystyrene Foam Cups' });
  if (!badReq) {
    badReq = await Requirement.create({
      shopId: shopAShop._id,
      createdByUserId: shopAUser._id,
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

  // ── 8. Active Partial Group Buy Pools (2 per category with 2-3 merchants) ───
  console.log('👥 Seeding Active Partial Group Buy Pools with Real Merchants in Queue...');
  const partialItems = CATALOGUE_PRODUCTS.filter((p) => p.isPartialPool);

  for (const item of partialItems) {
    const prod = productMap[item.canonicalName];
    const off = offerMap[item.canonicalName];
    const totalPooled = item.partialContributions.reduce((sum, c) => sum + c.quantity, 0);
    const activeTierPriceMinor = item.partialContributions[0]?.unitPriceMinor || item.baseUnitPriceMinor;

    const poolDoc = await GroupBuyPool.create({
      title: item.canonicalName,
      createdByUserId: shopAUser._id,
      productId: prod._id,
      supplierOfferId: off._id,
      deliveryArea: 'LUCKNOW',
      currency: 'INR',
      packUnit: item.baseUnit,
      targetMoq: item.moq,
      retailerMoqPercentage: item.minRetailerQuantity ? Math.round((item.minRetailerQuantity / item.moq) * 100) : 20,
      retailerStepPercentage: item.step ? Math.max(1, Math.round((item.step / item.moq) * 100)) : 1,
      minRetailerQuantity: item.minRetailerQuantity || Math.max(1, Math.round(item.moq * 0.2)),
      quantityStepMultiple: item.step || 1,
      totalEligibleQuantity: totalPooled,
      participantCount: item.partialContributions.length,
      baseUnitPriceMinor: item.baseUnitPriceMinor,
      currentUnitPriceMinor: activeTierPriceMinor,
      estimatedMerchandiseTotalMinor: totalPooled * activeTierPriceMinor,
      shippingCostMinor: 0,
      shippingAllocationMethod: 'PER_UNIT',
      paymentPolicy: 'PAY_AT_JOIN',
      publishedAt: new Date(Date.now() - 14 * 3600000),
      deadline: new Date(Date.now() + 7 * 24 * 3600000),
      state: 'RECRUITING',
      dataSourceType: 'SEEDED_DEMO',
      pricingTiers: item.tiers.map((t) => ({ minQuantity: t.minQuantity, unitPriceMinor: t.unitPriceMinor })),
    });

    // Create contributions and captured payments for each participating merchant in the queue
    for (const pc of item.partialContributions) {
      const buyerUser = userMap[pc.shopKey];
      const buyerShop = shopMap[pc.shopKey];
      const payableMinor = pc.quantity * activeTierPriceMinor;

      const contrib = await Contribution.create({
        poolId: poolDoc._id,
        shopId: buyerShop._id,
        createdByUserId: buyerUser._id,
        quantity: pc.quantity,
        unit: item.baseUnit,
        unitPriceMinor: activeTierPriceMinor,
        estimatedMerchandiseShareMinor: payableMinor,
        finalTotalPayableMinor: payableMinor,
        totalPaidMinor: payableMinor,
        approvalStatus: 'NOT_REQUIRED_YET',
        state: 'ACTIVE',
      });

      await Payment.create({
        poolId: poolDoc._id,
        contributionId: contrib._id,
        shopId: buyerShop._id,
        payerUserId: buyerUser._id,
        amountMinor: payableMinor,
        currency: 'INR',
        paymentPurpose: 'INITIAL_JOIN',
        provider: 'PAYPAL_SANDBOX',
        providerOrderId: `MOCK_ORDER_${contrib._id}`,
        providerCaptureId: `MOCK_CAP_${contrib._id}`,
        idempotencyKey: `SEED_IDEMP_${contrib._id}`,
        paymentStatus: 'PAID',
        status: 'PAID',
        paidAt: new Date(),
        isTestTransaction: true,
      });
    }
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
      totalProducts: CATALOGUE_PRODUCTS.length,
      categoriesSeeded: 6,
      partialPoolsSeeded: partialItems.length,
      totalSuppliers: SUPPLIERS_DATA.length,
      timestamp: new Date().toISOString(),
    },
  });

  console.log('✅ CoBuy AI Master Database Seeder Completed Successfully!');
  console.log(`   - 60 Master Products across 6 Categories`);
  console.log(`   - 8 Verified Wholesale Suppliers`);
  console.log(`   - 12 Active Partial Group Buy Pools in RECRUITING state`);
  console.log(`   - All Demo Contributions & Captured Payments Persisted in MongoDB`);
  console.log('-------------------------------------------------------------');
  console.log('Demo Credentials (All accounts use password: Password123!)');
  console.log('  Retailers:   retailer1@example.com (Shop A), retailer2@example.com (Shop B), retailer3@example.com (Shop C)');
  console.log('  Aliases:     cafea@demo.aapkidukan.in, bakeryb@demo.aapkidukan.in, bistroc@demo.aapkidukan.in');
  console.log('  Wholesalers: wholesaler1@example.com, wholesaler2@example.com');
  console.log('  Admin:       admin@example.com (or admin@demo.aapkidukan.in)');
  console.log('-------------------------------------------------------------');

  await disconnectDB();
}

seedMasterData().catch((err) => {
  console.error('❌ Master Seeder Failed:', err);
  process.exit(1);
});
