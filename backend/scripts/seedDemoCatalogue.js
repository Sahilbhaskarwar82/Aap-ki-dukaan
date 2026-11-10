/**
 * HIM-09 Demo Catalogue Seeder — seedDemoCatalogue.js
 *
 * Safely populates the development MongoDB database (aapKiDukaan) with demo
 * Supplier, Product, and SupplierOffer records for local/development testing.
 *
 * SAFETY GUARANTEES:
 * - Aborts if NODE_ENV is "production".
 * - Never deletes, clears, or destructively modifies any existing records.
 * - All inserts are idempotent: stable `seedKey` string used to upsert;
 *   repeated runs produce exactly zero duplicate documents.
 * - All demo records carry dataSourceType="SEEDED_DEMO" and
 *   verificationStatus="DEMO_SAMPLE" — never labelled as real or verified.
 *
 * Usage:
 *   node backend/scripts/seedDemoCatalogue.js
 */

import env from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { Product } from '../src/models/Product.model.js';
import { Supplier } from '../src/models/Supplier.model.js';
import { SupplierOffer } from '../src/models/SupplierOffer.model.js';

// ─── Safety Guard ──────────────────────────────────────────────────────────────
// Intentional Opt-In Guard to protect clean environments against accidental seeding
const hasOptIn =
  process.env.ALLOW_DEMO_SEEDING === 'true' ||
  process.argv.includes('--confirm-seed') ||
  process.argv.includes('--force');
if (!hasOptIn) {
  console.warn('\n⚠️  DEMO SEEDING GUARD: Demo seeding is disabled by default to protect clean testing environments.');
  console.warn('To intentionally repopulate demo data for development/evaluations, run with:');
  console.warn('   node backend/scripts/seedDemoCatalogue.js --confirm-seed');
  console.warn('   or set environment variable ALLOW_DEMO_SEEDING=true\n');
  process.exit(0);
}

if (env.NODE_ENV === 'production') {
  console.error('❌  ABORTED: Cannot run demo seeder in production environment (NODE_ENV=production).');
  process.exit(1);
}

// ─── Helper ───────────────────────────────────────────────────────────────────
const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
const daysAgo     = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

// ─── DEMO PRODUCTS (canonical master catalogue records) ───────────────────────
const DEMO_PRODUCTS = [
  {
    seedKey: 'DEMO_PRODUCT_PACKAGING_COFFEE_CUP_250ML',
    canonicalName: 'Bio-Degradable Coffee Cups 250ml',
    category: 'PACKAGING',
    baseUnit: 'UNIT',
    packSizeDescription: '1000 cups / carton',
    unitsPerPack: 1000,
    specifications: { material: 'PLA-Lined Kraft Paper', capacityOrSize: '250ml', foodSafe: true, certifications: ['FSSAI', 'FDA'], grade: 'FOOD_GRADE' },
    synonyms: ['disposable cup', 'paper cup', 'coffee cup', 'compostable cup'],
    brand: 'GENERIC',
  },
  {
    seedKey: 'DEMO_PRODUCT_PACKAGING_TAKEAWAY_BOX_750ML',
    canonicalName: 'Kraft Takeaway Box 750ml',
    category: 'PACKAGING',
    baseUnit: 'UNIT',
    packSizeDescription: '500 boxes / carton',
    unitsPerPack: 500,
    specifications: { material: 'Kraft Paperboard', capacityOrSize: '750ml', foodSafe: true, certifications: ['FSSAI'], grade: 'FOOD_GRADE' },
    synonyms: ['takeaway container', 'food box', 'kraft box', 'lunch box'],
    brand: 'GENERIC',
  },
  {
    seedKey: 'DEMO_PRODUCT_GRAINS_BASMATI_RICE_5KG',
    canonicalName: 'Basmati Rice Extra Long Grain 5kg',
    category: 'GRAINS',
    baseUnit: 'BAG',
    packSizeDescription: '1 bag = 5kg',
    unitsPerPack: 1,
    specifications: { material: 'Paddy Rice', capacityOrSize: '5kg', foodSafe: true, certifications: ['AGMARK', 'FSSAI'], grade: 'PREMIUM' },
    synonyms: ['basmati', 'rice', 'long grain rice', 'premium rice'],
    brand: 'GENERIC',
  },
  {
    seedKey: 'DEMO_PRODUCT_PULSES_YELLOW_LENTIL_1KG',
    canonicalName: 'Yellow Lentil (Moong Dal) 1kg',
    category: 'PULSES',
    baseUnit: 'BAG',
    packSizeDescription: '1 bag = 1kg',
    unitsPerPack: 1,
    specifications: { material: 'Pulse — Vigna radiata', capacityOrSize: '1kg', foodSafe: true, certifications: ['FSSAI'], grade: 'STANDARD' },
    synonyms: ['moong dal', 'yellow lentil', 'split mung bean', 'green gram dal'],
    brand: 'GENERIC',
  },
  {
    seedKey: 'DEMO_PRODUCT_SPICES_TURMERIC_POWDER_500G',
    canonicalName: 'Turmeric Powder 500g',
    category: 'SPICES',
    baseUnit: 'UNIT',
    packSizeDescription: '1 pouch = 500g',
    unitsPerPack: 1,
    specifications: { material: 'Curcuma longa', capacityOrSize: '500g', foodSafe: true, certifications: ['FSSAI'], grade: 'STANDARD' },
    synonyms: ['haldi', 'turmeric', 'golden spice', 'curcumin powder'],
    brand: 'GENERIC',
  },
  {
    seedKey: 'DEMO_PRODUCT_EDIBLE_OIL_SUNFLOWER_15L',
    canonicalName: 'Refined Sunflower Oil 15L',
    category: 'EDIBLE_OILS',
    baseUnit: 'TIN',
    packSizeDescription: '1 tin = 15 litres',
    unitsPerPack: 1,
    specifications: { material: 'Helianthus annuus', capacityOrSize: '15L', foodSafe: true, certifications: ['FSSAI', 'AGMARK'], grade: 'REFINED' },
    synonyms: ['sunflower oil', 'cooking oil', 'refined oil', 'vegetable oil'],
    brand: 'GENERIC',
  },
  {
    seedKey: 'DEMO_PRODUCT_BEVERAGES_GREEN_TEA_100BAG',
    canonicalName: 'Premium Green Tea Bags 100-Pack',
    category: 'BEVERAGES',
    baseUnit: 'BOX',
    packSizeDescription: '1 box = 100 tea bags',
    unitsPerPack: 100,
    specifications: { material: 'Camellia sinensis', capacityOrSize: '100 bags', foodSafe: true, certifications: ['FSSAI'], grade: 'PREMIUM' },
    synonyms: ['green tea', 'tea bags', 'herbal tea', 'antioxidant tea'],
    brand: 'GENERIC',
  },
  {
    seedKey: 'DEMO_PRODUCT_CLEANING_FLOOR_CLEANER_5L',
    canonicalName: 'Concentrated Floor Cleaner Citrus 5L',
    category: 'CLEANING',
    baseUnit: 'UNIT',
    packSizeDescription: '1 can = 5 litres',
    unitsPerPack: 1,
    specifications: { material: 'Surfactant blend — Citrus-based', capacityOrSize: '5L', foodSafe: false, certifications: [], grade: 'COMMERCIAL' },
    synonyms: ['floor cleaner', 'floor liquid', 'citrus cleaner', 'mopping solution'],
    brand: 'GENERIC',
  },
  {
    seedKey: 'DEMO_PRODUCT_SNACKS_POTATO_CHIPS_2KG',
    canonicalName: 'Ready-to-Fry Potato Chips Slices 2kg',
    category: 'SNACKS',
    baseUnit: 'BAG',
    packSizeDescription: '1 bag = 2kg',
    unitsPerPack: 1,
    specifications: { material: 'Potato — Solanum tuberosum', capacityOrSize: '2kg', foodSafe: true, certifications: ['FSSAI'], grade: 'FOOD_GRADE' },
    synonyms: ['potato chips', 'fries', 'crispy chips', 'ready fry chips'],
    brand: 'GENERIC',
  },
  {
    seedKey: 'DEMO_PRODUCT_DAIRY_FULL_CREAM_MILK_1L',
    canonicalName: 'Full Cream Toned Milk Tetra Pack 1L',
    category: 'DAIRY',
    baseUnit: 'UNIT',
    packSizeDescription: '1 pack = 1 litre',
    unitsPerPack: 1,
    specifications: { material: 'Pasteurised Toned Cow Milk', capacityOrSize: '1L', foodSafe: true, certifications: ['FSSAI', 'AGMARK'], grade: 'PREMIUM' },
    synonyms: ['milk', 'full cream milk', 'tetra pack milk', 'white milk'],
    brand: 'GENERIC',
  },
];

// ─── DEMO SUPPLIERS ────────────────────────────────────────────────────────────
const DEMO_SUPPLIERS = [
  {
    seedKey: 'DEMO_SUPPLIER_ECOPACK_INDIA',
    name: 'EcoPack India Ltd',
    contactReference: { contactPerson: 'Anil Sharma', email: 'demo@ecopack.example.com', phone: '+91-9800000001', address: 'Sector 18, Noida, UP 201301' },
    serviceAreas: ['DELHI_NCR', 'BANGALORE', 'MUMBAI_METRO'],
    verificationStatus: 'DEMO_ONLY',
    activeStatus: 'ACTIVE',
    dataSourceType: 'SEEDED_DEMO',
  },
  {
    seedKey: 'DEMO_SUPPLIER_GRAIN_VALLEY',
    name: 'Grain Valley Distributors Pvt Ltd',
    contactReference: { contactPerson: 'Priya Kaur', email: 'demo@grainvalley.example.com', phone: '+91-9800000002', address: 'Amritsar Road, Ludhiana, Punjab' },
    serviceAreas: ['DELHI_NCR', 'CHANDIGARH'],
    verificationStatus: 'DEMO_ONLY',
    activeStatus: 'ACTIVE',
    dataSourceType: 'SEEDED_DEMO',
  },
  {
    seedKey: 'DEMO_SUPPLIER_SOUTH_SPICE',
    name: 'South Spice Wholesale Hub',
    contactReference: { contactPerson: 'Ravi Kumar', email: 'demo@southspice.example.com', phone: '+91-9800000003', address: 'Koramangala, Bangalore, KA 560034' },
    serviceAreas: ['BANGALORE', 'CHENNAI', 'HYDERABAD'],
    verificationStatus: 'DEMO_ONLY',
    activeStatus: 'ACTIVE',
    dataSourceType: 'SEEDED_DEMO',
  },
  {
    seedKey: 'DEMO_SUPPLIER_MUMBAI_AGRO',
    name: 'Mumbai Agro Supplies Co.',
    contactReference: { contactPerson: 'Nisha Patel', email: 'demo@mumbaiagro.example.com', phone: '+91-9800000004', address: 'APMC, Vashi, Navi Mumbai 400703' },
    serviceAreas: ['MUMBAI_METRO', 'PUNE', 'AHMEDABAD'],
    verificationStatus: 'DEMO_ONLY',
    activeStatus: 'ACTIVE',
    dataSourceType: 'SEEDED_DEMO',
  },
];

// ─── DEMO SUPPLIER OFFERS ──────────────────────────────────────────────────────
// Built after seeding Products and Suppliers so we can reference their _ids.
function buildDemoOffers(products, suppliers) {
  const byKey = (arr, k) => arr.find((x) => x.seedKey === k);

  const ecopack     = byKey(suppliers, 'DEMO_SUPPLIER_ECOPACK_INDIA');
  const grainValley = byKey(suppliers, 'DEMO_SUPPLIER_GRAIN_VALLEY');
  const southSpice  = byKey(suppliers, 'DEMO_SUPPLIER_SOUTH_SPICE');
  const mumbaiAgro  = byKey(suppliers, 'DEMO_SUPPLIER_MUMBAI_AGRO');

  const coffeeCup    = byKey(products, 'DEMO_PRODUCT_PACKAGING_COFFEE_CUP_250ML');
  const takeawayBox  = byKey(products, 'DEMO_PRODUCT_PACKAGING_TAKEAWAY_BOX_750ML');
  const basmatiRice  = byKey(products, 'DEMO_PRODUCT_GRAINS_BASMATI_RICE_5KG');
  const moongDal     = byKey(products, 'DEMO_PRODUCT_PULSES_YELLOW_LENTIL_1KG');
  const turmeric     = byKey(products, 'DEMO_PRODUCT_SPICES_TURMERIC_POWDER_500G');
  const sunflowerOil = byKey(products, 'DEMO_PRODUCT_EDIBLE_OIL_SUNFLOWER_15L');
  const greenTea     = byKey(products, 'DEMO_PRODUCT_BEVERAGES_GREEN_TEA_100BAG');
  const floorCleaner = byKey(products, 'DEMO_PRODUCT_CLEANING_FLOOR_CLEANER_5L');
  const potatoChips  = byKey(products, 'DEMO_PRODUCT_SNACKS_POTATO_CHIPS_2KG');
  const milk         = byKey(products, 'DEMO_PRODUCT_DAIRY_FULL_CREAM_MILK_1L');

  return [
    // ── PACKAGING ──────────────────────────────────────────────────────────────
    {
      seedKey: 'DEMO_OFFER_ECOPACK_COFFEE_CUP_NCR',
      supplierId: ecopack._id,
      productId: coffeeCup._id,
      supplierProductDescription: 'PLA-lined kraft paper cups, food-grade, compostable. Suitable for hot beverages. Minimum order: 1 carton (1000 cups).',
      packUnit: 'CARTON',
      packSize: '1000 cups / carton',
      currency: 'INR',
      baseUnitPriceMinor: 250,       // ₹2.50 per cup
      quantityTiers: [
        { minQuantity: 1000,  maxQuantity: 4999,  unitPriceMinor: 250 },
        { minQuantity: 5000,  maxQuantity: 9999,  unitPriceMinor: 230 },
        { minQuantity: 10000, maxQuantity: null,  unitPriceMinor: 210 },
      ],
      minimumOrderQuantity: 1000,
      retailerMoqPercentage: 20,
      retailerStepPercentage: 1,
      deliveryAreas: ['DELHI_NCR', 'MUMBAI_METRO'],
      leadTimeDays: 4,
      shippingTerms: 'EX_WORKS',
      flatShippingCostMinor: 150000,  // ₹1500 flat shipping
      shippingAllocationMethod: 'PER_UNIT',
      taxInclusion: 'GST_EXCLUDED',
      availabilityStatus: 'IN_STOCK',
      quoteTimestamp: daysAgo(3),
      expiresAt: daysFromNow(27),
      dataSourceType: 'SEEDED_DEMO',
      verificationStatus: 'DEMO_SAMPLE',
      isActive: true,
    },
    {
      seedKey: 'DEMO_OFFER_ECOPACK_COFFEE_CUP_BANGALORE',
      supplierId: ecopack._id,
      productId: coffeeCup._id,
      supplierProductDescription: 'Same PLA-lined kraft cups as NCR offer — priced for Bangalore wholesale corridor.',
      packUnit: 'CARTON',
      packSize: '1000 cups / carton',
      currency: 'INR',
      baseUnitPriceMinor: 260,       // ₹2.60 per cup
      quantityTiers: [
        { minQuantity: 1000, maxQuantity: 4999,  unitPriceMinor: 260 },
        { minQuantity: 5000, maxQuantity: null,  unitPriceMinor: 240 },
      ],
      minimumOrderQuantity: 1000,
      retailerMoqPercentage: 20,
      retailerStepPercentage: 1,
      deliveryAreas: ['BANGALORE'],
      leadTimeDays: 6,
      shippingTerms: 'EX_WORKS',
      flatShippingCostMinor: 200000,  // ₹2000 flat shipping
      shippingAllocationMethod: 'PER_UNIT',
      taxInclusion: 'GST_EXCLUDED',
      availabilityStatus: 'IN_STOCK',
      quoteTimestamp: daysAgo(10),
      expiresAt: daysFromNow(20),
      dataSourceType: 'SEEDED_DEMO',
      verificationStatus: 'DEMO_SAMPLE',
      isActive: true,
    },
    {
      seedKey: 'DEMO_OFFER_MUMBAI_TAKEAWAY_BOX',
      supplierId: mumbaiAgro._id,
      productId: takeawayBox._id,
      supplierProductDescription: 'Kraft paperboard 750ml takeaway boxes — grease-resistant lining, microwave-safe. Wholesale min 500 boxes per run.',
      packUnit: 'CARTON',
      packSize: '500 boxes / carton',
      currency: 'INR',
      baseUnitPriceMinor: 380,       // ₹3.80 per box
      quantityTiers: [
        { minQuantity: 500,  maxQuantity: 1999, unitPriceMinor: 380 },
        { minQuantity: 2000, maxQuantity: null, unitPriceMinor: 350 },
      ],
      minimumOrderQuantity: 500,
      retailerMoqPercentage: 20,
      retailerStepPercentage: 1,
      deliveryAreas: ['MUMBAI_METRO', 'PUNE'],
      leadTimeDays: 5,
      shippingTerms: 'DELIVERED',
      flatShippingCostMinor: null,   // Shipping Quote Pending
      shippingAllocationMethod: 'EQUAL_SHARE',
      taxInclusion: 'GST_EXCLUDED',
      availabilityStatus: 'IN_STOCK',
      quoteTimestamp: daysAgo(2),
      expiresAt: daysFromNow(28),
      dataSourceType: 'SEEDED_DEMO',
      verificationStatus: 'DEMO_SAMPLE',
      isActive: true,
    },

    // ── GRAINS ─────────────────────────────────────────────────────────────────
    {
      seedKey: 'DEMO_OFFER_GRAIN_VALLEY_BASMATI_NCR',
      supplierId: grainValley._id,
      productId: basmatiRice._id,
      supplierProductDescription: 'Extra-long grain aged Basmati rice from Punjab farms. AGMARK Grade A. 5kg retail bags, 40-bag wholesale master carton.',
      packUnit: 'BAG',
      packSize: '5kg per bag',
      currency: 'INR',
      baseUnitPriceMinor: 38000,     // ₹380 per 5kg bag
      quantityTiers: [
        { minQuantity: 100, maxQuantity: 499, unitPriceMinor: 38000 },
        { minQuantity: 500, maxQuantity: null, unitPriceMinor: 35500 },
      ],
      minimumOrderQuantity: 100,
      retailerMoqPercentage: 20,
      retailerStepPercentage: 5,
      deliveryAreas: ['DELHI_NCR', 'CHANDIGARH'],
      leadTimeDays: 2,
      shippingTerms: 'DELIVERED',
      flatShippingCostMinor: 50000,  // ₹500 flat shipping
      shippingAllocationMethod: 'PER_UNIT',
      taxInclusion: 'GST_EXCLUDED',
      availabilityStatus: 'IN_STOCK',
      quoteTimestamp: daysAgo(1),
      expiresAt: daysFromNow(30),
      dataSourceType: 'SEEDED_DEMO',
      verificationStatus: 'DEMO_SAMPLE',
      isActive: true,
    },
    {
      seedKey: 'DEMO_OFFER_MUMBAI_BASMATI_RICE',
      supplierId: mumbaiAgro._id,
      productId: basmatiRice._id,
      supplierProductDescription: 'Aged Basmati from licensed UP processor — 5kg branded bags for retail shelving. Mumbai/Pune corridor.',
      packUnit: 'BAG',
      packSize: '5kg per bag',
      currency: 'INR',
      baseUnitPriceMinor: 40000,     // ₹400 per 5kg bag — slightly higher
      quantityTiers: [
        { minQuantity: 50, maxQuantity: 199, unitPriceMinor: 40000 },
        { minQuantity: 200, maxQuantity: null, unitPriceMinor: 37000 },
      ],
      minimumOrderQuantity: 50,
      retailerMoqPercentage: 20,
      retailerStepPercentage: 5,
      deliveryAreas: ['MUMBAI_METRO', 'PUNE', 'AHMEDABAD'],
      leadTimeDays: 3,
      shippingTerms: 'EX_WORKS',
      flatShippingCostMinor: 80000,  // ₹800 flat shipping
      shippingAllocationMethod: 'PER_UNIT',
      taxInclusion: 'GST_EXCLUDED',
      availabilityStatus: 'IN_STOCK',
      quoteTimestamp: daysAgo(5),
      expiresAt: daysFromNow(25),
      dataSourceType: 'SEEDED_DEMO',
      verificationStatus: 'DEMO_SAMPLE',
      isActive: true,
    },

    // ── PULSES ─────────────────────────────────────────────────────────────────
    {
      seedKey: 'DEMO_OFFER_GRAIN_VALLEY_MOONG_DAL',
      supplierId: grainValley._id,
      productId: moongDal._id,
      supplierProductDescription: 'Yellow split moong dal sourced from Rajasthan. FSSAI certified. Available in 1kg and 25kg bulk packing.',
      packUnit: 'BAG',
      packSize: '1kg per bag',
      currency: 'INR',
      baseUnitPriceMinor: 9500,      // ₹95 per kg
      quantityTiers: [
        { minQuantity: 200,  maxQuantity: 999,  unitPriceMinor: 9500 },
        { minQuantity: 1000, maxQuantity: null, unitPriceMinor: 8800 },
      ],
      minimumOrderQuantity: 200,
      retailerMoqPercentage: 20,
      retailerStepPercentage: 5,
      deliveryAreas: ['DELHI_NCR'],
      leadTimeDays: 3,
      shippingTerms: 'EX_WORKS',
      flatShippingCostMinor: 30000,  // ₹300 flat shipping
      shippingAllocationMethod: 'PER_UNIT',
      taxInclusion: 'GST_EXCLUDED',
      availabilityStatus: 'IN_STOCK',
      quoteTimestamp: daysAgo(4),
      expiresAt: daysFromNow(26),
      dataSourceType: 'SEEDED_DEMO',
      verificationStatus: 'DEMO_SAMPLE',
      isActive: true,
    },

    // ── SPICES ─────────────────────────────────────────────────────────────────
    {
      seedKey: 'DEMO_OFFER_SOUTH_SPICE_TURMERIC_BANGALORE',
      supplierId: southSpice._id,
      productId: turmeric._id,
      supplierProductDescription: 'Mysore turmeric powder — high curcumin content 3%+. 500g retail pouches, 60-pouch master carton. FSSAI certified.',
      packUnit: 'CARTON',
      packSize: '60 pouches of 500g / carton',
      currency: 'INR',
      baseUnitPriceMinor: 8500,      // ₹85 per 500g pouch
      quantityTiers: [
        { minQuantity: 120, maxQuantity: 599,  unitPriceMinor: 8500 },
        { minQuantity: 600, maxQuantity: null, unitPriceMinor: 7800 },
      ],
      minimumOrderQuantity: 120,
      retailerMoqPercentage: 20,
      retailerStepPercentage: 5,
      deliveryAreas: ['BANGALORE', 'CHENNAI', 'HYDERABAD'],
      leadTimeDays: 4,
      shippingTerms: 'DELIVERED',
      flatShippingCostMinor: 60000,  // ₹600 flat shipping
      shippingAllocationMethod: 'EQUAL_SHARE',
      taxInclusion: 'GST_EXCLUDED',
      availabilityStatus: 'IN_STOCK',
      quoteTimestamp: daysAgo(7),
      expiresAt: daysFromNow(23),
      dataSourceType: 'SEEDED_DEMO',
      verificationStatus: 'DEMO_SAMPLE',
      isActive: true,
    },

    // ── EDIBLE OILS ────────────────────────────────────────────────────────────
    {
      seedKey: 'DEMO_OFFER_MUMBAI_SUNFLOWER_OIL',
      supplierId: mumbaiAgro._id,
      productId: sunflowerOil._id,
      supplierProductDescription: 'Double-refined sunflower oil in 15L food-grade tin cans. FSSAI & AGMARK certified. Ideal for HoReCa bulk procurement.',
      packUnit: 'TIN',
      packSize: '15 litres per tin',
      currency: 'INR',
      baseUnitPriceMinor: 220000,    // ₹2200 per 15L tin
      quantityTiers: [
        { minQuantity: 50,  maxQuantity: 199, unitPriceMinor: 220000 },
        { minQuantity: 200, maxQuantity: null, unitPriceMinor: 205000 },
      ],
      minimumOrderQuantity: 50,
      retailerMoqPercentage: 20,
      retailerStepPercentage: 5,
      deliveryAreas: ['MUMBAI_METRO', 'PUNE', 'AHMEDABAD'],
      leadTimeDays: 3,
      shippingTerms: 'EX_WORKS',
      flatShippingCostMinor: 100000, // ₹1000 flat shipping
      shippingAllocationMethod: 'PER_UNIT',
      taxInclusion: 'GST_EXCLUDED',
      availabilityStatus: 'IN_STOCK',
      quoteTimestamp: daysAgo(2),
      expiresAt: daysFromNow(28),
      dataSourceType: 'SEEDED_DEMO',
      verificationStatus: 'DEMO_SAMPLE',
      isActive: true,
    },
    {
      seedKey: 'DEMO_OFFER_SOUTH_SPICE_SUNFLOWER_OIL',
      supplierId: southSpice._id,
      productId: sunflowerOil._id,
      supplierProductDescription: 'Premium refined sunflower oil — Bangalore food-industry distributor. 15L tins, AGMARK. Next-day delivery within Bangalore.',
      packUnit: 'TIN',
      packSize: '15 litres per tin',
      currency: 'INR',
      baseUnitPriceMinor: 215000,    // ₹2150 per 15L tin — cheaper
      quantityTiers: [
        { minQuantity: 50, maxQuantity: 99,  unitPriceMinor: 215000 },
        { minQuantity: 100, maxQuantity: null, unitPriceMinor: 200000 },
      ],
      minimumOrderQuantity: 50,
      retailerMoqPercentage: 20,
      retailerStepPercentage: 5,
      deliveryAreas: ['BANGALORE', 'CHENNAI'],
      leadTimeDays: 1,
      shippingTerms: 'DELIVERED',
      flatShippingCostMinor: 50000,  // ₹500 flat shipping
      shippingAllocationMethod: 'PER_UNIT',
      taxInclusion: 'GST_EXCLUDED',
      availabilityStatus: 'IN_STOCK',
      quoteTimestamp: daysAgo(1),
      expiresAt: daysFromNow(29),
      dataSourceType: 'SEEDED_DEMO',
      verificationStatus: 'DEMO_SAMPLE',
      isActive: true,
    },

    // ── BEVERAGES ──────────────────────────────────────────────────────────────
    {
      seedKey: 'DEMO_OFFER_SOUTH_SPICE_GREEN_TEA',
      supplierId: southSpice._id,
      productId: greenTea._id,
      supplierProductDescription: 'Nilgiri premium green tea bags — 100 bags per retail box. South Indian tea garden sourced. Bulk carton: 48 boxes.',
      packUnit: 'CARTON',
      packSize: '48 boxes of 100 tea bags / carton',
      currency: 'INR',
      baseUnitPriceMinor: 14000,     // ₹140 per 100-bag box
      quantityTiers: [
        { minQuantity: 96, maxQuantity: 479, unitPriceMinor: 14000 },
        { minQuantity: 480, maxQuantity: null, unitPriceMinor: 12500 },
      ],
      minimumOrderQuantity: 96,
      retailerMoqPercentage: 25,
      retailerStepPercentage: 2,
      deliveryAreas: ['BANGALORE', 'CHENNAI', 'HYDERABAD'],
      leadTimeDays: 5,
      shippingTerms: 'EX_WORKS',
      flatShippingCostMinor: 45000,  // ₹450 flat shipping
      shippingAllocationMethod: 'EQUAL_SHARE',
      taxInclusion: 'GST_EXCLUDED',
      availabilityStatus: 'IN_STOCK',
      quoteTimestamp: daysAgo(6),
      expiresAt: daysFromNow(24),
      dataSourceType: 'SEEDED_DEMO',
      verificationStatus: 'DEMO_SAMPLE',
      isActive: true,
    },

    // ── CLEANING ───────────────────────────────────────────────────────────────
    {
      seedKey: 'DEMO_OFFER_MUMBAI_FLOOR_CLEANER',
      supplierId: mumbaiAgro._id,
      productId: floorCleaner._id,
      supplierProductDescription: 'Citrus-based concentrated floor cleaner for commercial kitchens and retail floors. 5L cans, dilution 1:10.',
      packUnit: 'UNIT',
      packSize: '5 litres per can',
      currency: 'INR',
      baseUnitPriceMinor: 35000,     // ₹350 per 5L can
      quantityTiers: [
        { minQuantity: 50,  maxQuantity: 199, unitPriceMinor: 35000 },
        { minQuantity: 200, maxQuantity: null, unitPriceMinor: 32000 },
      ],
      minimumOrderQuantity: 50,
      retailerMoqPercentage: 20,
      retailerStepPercentage: 5,
      deliveryAreas: ['MUMBAI_METRO', 'PUNE'],
      leadTimeDays: 4,
      shippingTerms: 'EX_WORKS',
      flatShippingCostMinor: null,   // Shipping Quote Pending
      shippingAllocationMethod: 'PER_UNIT',
      taxInclusion: 'GST_EXCLUDED',
      availabilityStatus: 'IN_STOCK',
      quoteTimestamp: daysAgo(8),
      expiresAt: daysFromNow(22),
      dataSourceType: 'SEEDED_DEMO',
      verificationStatus: 'DEMO_SAMPLE',
      isActive: true,
    },

    // ── SNACKS ─────────────────────────────────────────────────────────────────
    {
      seedKey: 'DEMO_OFFER_MUMBAI_POTATO_CHIPS',
      supplierId: mumbaiAgro._id,
      productId: potatoChips._id,
      supplierProductDescription: 'Ready-to-fry potato chips slices (2mm slice, blanched). Ideal for quick-service restaurants and street food vendors.',
      packUnit: 'BAG',
      packSize: '2kg vacuum bag',
      currency: 'INR',
      baseUnitPriceMinor: 28000,     // ₹280 per 2kg bag
      quantityTiers: [
        { minQuantity: 100, maxQuantity: 499, unitPriceMinor: 28000 },
        { minQuantity: 500, maxQuantity: null, unitPriceMinor: 25000 },
      ],
      minimumOrderQuantity: 100,
      retailerMoqPercentage: 20,
      retailerStepPercentage: 5,
      deliveryAreas: ['MUMBAI_METRO', 'PUNE', 'AHMEDABAD'],
      leadTimeDays: 2,
      shippingTerms: 'EX_WORKS',
      flatShippingCostMinor: 70000,  // ₹700 flat shipping
      shippingAllocationMethod: 'PER_UNIT',
      taxInclusion: 'GST_EXCLUDED',
      availabilityStatus: 'IN_STOCK',
      quoteTimestamp: daysAgo(3),
      expiresAt: daysFromNow(27),
      dataSourceType: 'SEEDED_DEMO',
      verificationStatus: 'DEMO_SAMPLE',
      isActive: true,
    },

    // ── DAIRY ──────────────────────────────────────────────────────────────────
    {
      seedKey: 'DEMO_OFFER_SOUTH_SPICE_MILK',
      supplierId: southSpice._id,
      productId: milk._id,
      supplierProductDescription: 'UHT full-cream toned milk in 1L tetra-packs. Suitable for retail sale. 12 packs per wholesale shrink-wrap tray.',
      packUnit: 'TRAY',
      packSize: '12 packs of 1L per tray',
      currency: 'INR',
      baseUnitPriceMinor: 7200,      // ₹72 per 1L pack
      quantityTiers: [
        { minQuantity: 240, maxQuantity: 1199, unitPriceMinor: 7200 },
        { minQuantity: 1200, maxQuantity: null, unitPriceMinor: 6800 },
      ],
      minimumOrderQuantity: 240,
      retailerMoqPercentage: 20,
      retailerStepPercentage: 5,
      deliveryAreas: ['BANGALORE', 'CHENNAI'],
      leadTimeDays: 1,
      shippingTerms: 'DELIVERED',
      flatShippingCostMinor: 25000,  // ₹250 flat shipping
      shippingAllocationMethod: 'PER_UNIT',
      taxInclusion: 'GST_EXCLUDED',
      availabilityStatus: 'IN_STOCK',
      quoteTimestamp: daysAgo(0),
      expiresAt: daysFromNow(30),
      dataSourceType: 'SEEDED_DEMO',
      verificationStatus: 'DEMO_SAMPLE',
      isActive: true,
    },
    {
      seedKey: 'DEMO_OFFER_MUMBAI_MILK_BULK',
      supplierId: mumbaiAgro._id,
      productId: milk._id,
      supplierProductDescription: 'UHT milk tetra 1L — Mumbai dairy cooperative. Cold-chain delivered. 12-pack tray minimum.',
      packUnit: 'TRAY',
      packSize: '12 packs of 1L per tray',
      currency: 'INR',
      baseUnitPriceMinor: 7400,      // ₹74 per 1L pack
      quantityTiers: [
        { minQuantity: 120, maxQuantity: 599, unitPriceMinor: 7400 },
        { minQuantity: 600, maxQuantity: null, unitPriceMinor: 6900 },
      ],
      minimumOrderQuantity: 120,
      retailerMoqPercentage: 20,
      retailerStepPercentage: 5,
      deliveryAreas: ['MUMBAI_METRO', 'PUNE'],
      leadTimeDays: 2,
      shippingTerms: 'DELIVERED',
      flatShippingCostMinor: 30000,  // ₹300 flat shipping
      shippingAllocationMethod: 'PER_UNIT',
      taxInclusion: 'GST_EXCLUDED',
      availabilityStatus: 'IN_STOCK',
      quoteTimestamp: daysAgo(9),
      expiresAt: daysFromNow(21),
      dataSourceType: 'SEEDED_DEMO',
      verificationStatus: 'DEMO_SAMPLE',
      isActive: true,
    },

    // ── EXPIRED offers (for testing the "Include Expired" toggle) ──────────────
    {
      seedKey: 'DEMO_OFFER_EXPIRED_GRAIN_VALLEY_BASMATI_OLD',
      supplierId: grainValley._id,
      productId: basmatiRice._id,
      supplierProductDescription: 'EXPIRED DEMO — old basmati rice offer. Only visible when Include Expired Quotes is toggled on.',
      packUnit: 'BAG',
      packSize: '5kg per bag',
      currency: 'INR',
      baseUnitPriceMinor: 42000,     // ₹420 — old higher price
      quantityTiers: [],
      minimumOrderQuantity: 100,
      retailerMoqPercentage: 20,
      retailerStepPercentage: 5,
      deliveryAreas: ['DELHI_NCR'],
      leadTimeDays: 5,
      shippingTerms: 'EX_WORKS',
      flatShippingCostMinor: 50000,
      shippingAllocationMethod: 'PER_UNIT',
      taxInclusion: 'GST_EXCLUDED',
      availabilityStatus: 'OUT_OF_STOCK',
      quoteTimestamp: daysAgo(45),
      expiresAt: daysAgo(15),        // Expired 15 days ago
      dataSourceType: 'SEEDED_DEMO',
      verificationStatus: 'DEMO_SAMPLE',
      isActive: true,
    },
    {
      seedKey: 'DEMO_OFFER_EXPIRED_ECOPACK_CUP_OLD',
      supplierId: ecopack._id,
      productId: coffeeCup._id,
      supplierProductDescription: 'EXPIRED DEMO — old coffee cup pricing from previous quarter.',
      packUnit: 'CARTON',
      packSize: '1000 cups / carton',
      currency: 'INR',
      baseUnitPriceMinor: 300,       // ₹3.00 — old higher price
      quantityTiers: [],
      minimumOrderQuantity: 1000,
      retailerMoqPercentage: 20,
      retailerStepPercentage: 1,
      deliveryAreas: ['DELHI_NCR'],
      leadTimeDays: 7,
      shippingTerms: 'EX_WORKS',
      flatShippingCostMinor: 200000,
      shippingAllocationMethod: 'PER_UNIT',
      taxInclusion: 'GST_EXCLUDED',
      availabilityStatus: 'OUT_OF_STOCK',
      quoteTimestamp: daysAgo(60),
      expiresAt: daysAgo(30),        // Expired 30 days ago
      dataSourceType: 'SEEDED_DEMO',
      verificationStatus: 'DEMO_SAMPLE',
      isActive: true,
    },
  ];
}

// ─── Seeding Logic ────────────────────────────────────────────────────────────
async function seed() {
  console.log('\n🌱  Aap Ki Dukan — HIM-09 Demo Catalogue Seeder');
  console.log('═'.repeat(56));
  console.log(`   NODE_ENV : ${env.NODE_ENV}`);
  console.log(`   Database : aapKiDukaan @ ${env.MONGODB_URI}`);
  console.log('═'.repeat(56));

  // ── Before counts ──
  const beforeCounts = {
    products: await Product.countDocuments(),
    suppliers: await Supplier.countDocuments(),
    offers: await SupplierOffer.countDocuments(),
  };
  console.log('\n📊  Before seeding:');
  console.log(`   Products       : ${beforeCounts.products}`);
  console.log(`   Suppliers      : ${beforeCounts.suppliers}`);
  console.log(`   Supplier Offers: ${beforeCounts.offers}`);

  // ── Upsert Products ──
  console.log('\n📦  Upserting demo products…');
  const seededProducts = [];
  for (const data of DEMO_PRODUCTS) {
    const { seedKey, ...fields } = data;
    const doc = await Product.findOneAndUpdate(
      { canonicalName: fields.canonicalName, category: fields.category },
      { $setOnInsert: fields },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    seededProducts.push({ ...doc.toObject(), seedKey });
    console.log(`   ✓  ${fields.canonicalName} [${fields.category}]`);
  }

  // ── Upsert Suppliers ──
  console.log('\n🏢  Upserting demo suppliers…');
  const seededSuppliers = [];
  for (const data of DEMO_SUPPLIERS) {
    const { seedKey, ...fields } = data;
    const doc = await Supplier.findOneAndUpdate(
      { name: fields.name },
      { $setOnInsert: fields },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    seededSuppliers.push({ ...doc.toObject(), seedKey });
    console.log(`   ✓  ${fields.name}`);
  }

  // ── Upsert Offers ──
  console.log('\n🛒  Upserting demo supplier offers…');
  const offerDefs = buildDemoOffers(seededProducts, seededSuppliers);
  for (const data of offerDefs) {
    const { seedKey, ...fields } = data;
    // Upsert key: stable seedKey stored in supplierProductDescription prefix + supplier + product
    // Using $setOnInsert with a compound lookup that doesn't repeat array path
    const existingOffer = await SupplierOffer.findOne({
      supplierId: fields.supplierId,
      productId: fields.productId,
      dataSourceType: 'SEEDED_DEMO',
      supplierProductDescription: fields.supplierProductDescription,
    }).lean();
    if (!existingOffer) {
      await SupplierOffer.create(fields);
    }
    const isExpired = fields.expiresAt < new Date();
    console.log(`   ✓  ${seedKey}${isExpired ? ' [EXPIRED]' : ''}`);
  }

  // ── After counts ──
  const afterCounts = {
    products: await Product.countDocuments(),
    suppliers: await Supplier.countDocuments(),
    offers: await SupplierOffer.countDocuments(),
  };
  console.log('\n📊  After seeding:');
  console.log(`   Products       : ${afterCounts.products}  (+${afterCounts.products - beforeCounts.products})`);
  console.log(`   Suppliers      : ${afterCounts.suppliers}  (+${afterCounts.suppliers - beforeCounts.suppliers})`);
  console.log(`   Supplier Offers: ${afterCounts.offers}  (+${afterCounts.offers - beforeCounts.offers})`);
  console.log('\n✅  Demo catalogue seeding complete.\n');
}

// ─── Entry Point ──────────────────────────────────────────────────────────────
(async () => {
  try {
    await connectDB();
    await seed();
  } catch (err) {
    console.error('❌  Seeder failed:', err.message || err);
    process.exit(1);
  } finally {
    await disconnectDB();
    process.exit(0);
  }
})();
