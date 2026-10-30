/**
 * Reusable Financial and Currency Utilities — Aap-ki-dukaan (SUJ-01)
 *
 * All authoritative monetary calculations operate on integer MINOR UNITS
 * (paise for INR, cents for USD) to eliminate IEEE-754 floating-point inaccuracies.
 */

export const SUPPORTED_CURRENCIES = Object.freeze(['INR', 'USD']);
export const DEFAULT_CURRENCY = 'INR';

const CURRENCY_CONFIG = Object.freeze({
  INR: {
    locale: 'en-IN',
    symbol: '₹',
    fractionDigits: 2,
    code: 'INR',
  },
  USD: {
    locale: 'en-US',
    symbol: '$',
    fractionDigits: 2,
    code: 'USD',
  },
});

/**
 * Validates whether a value is a valid integer minor unit.
 * @param {any} val
 * @param {boolean} [allowNegative=false]
 * @returns {boolean}
 */
export function isValidMinor(val, allowNegative = false) {
  if (typeof val !== 'number' || !Number.isFinite(val) || !Number.isInteger(val)) {
    return false;
  }
  return allowNegative ? true : val >= 0;
}

/**
 * Returns currency symbol for a supported currency.
 * @param {string} [currency='INR']
 * @returns {string}
 */
export function getCurrencySymbol(currency = DEFAULT_CURRENCY) {
  const code = (currency || DEFAULT_CURRENCY).toUpperCase();
  return CURRENCY_CONFIG[code]?.symbol || '₹';
}

/**
 * Converts major currency value (e.g. 4800) to minor units (paise/cents, 480000).
 * Safe from float rounding errors.
 * @param {number|string} major
 * @returns {number}
 */
export function toMinor(major) {
  if (major === null || major === undefined || major === '') return 0;
  const num = typeof major === 'string' ? parseFloat(major) : major;
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

/**
 * Converts minor currency value (e.g. 480000) to major units (4800.00).
 * @param {number} minor
 * @returns {number}
 */
export function toMajor(minor) {
  if (!Number.isFinite(minor)) return 0;
  return minor / 100;
}

/**
 * Formats minor currency units into a locale-aware display string.
 * e.g., 480000 -> "₹4,800.00"
 *
 * @param {number} amountMinor
 * @param {string} [currency='INR']
 * @param {object} [options={}]
 * @param {boolean} [options.showSymbol=true]
 * @param {boolean} [options.hideDecimalsIfZero=false]
 * @param {string} [options.fallback='₹0.00']
 * @returns {string}
 */
export function formatMinorToMajor(amountMinor, currency = DEFAULT_CURRENCY, options = {}) {
  const {
    showSymbol = true,
    hideDecimalsIfZero = false,
    fallback,
  } = options;

  const code = (currency || DEFAULT_CURRENCY).toUpperCase();
  const config = CURRENCY_CONFIG[code] || CURRENCY_CONFIG.INR;

  if (amountMinor === null || amountMinor === undefined || !Number.isFinite(amountMinor)) {
    if (fallback !== undefined) return fallback;
    return showSymbol ? `${config.symbol}0.00` : '0.00';
  }

  const major = amountMinor / 100;
  const hasZeroDecimals = amountMinor % 100 === 0;
  const fractionDigits = hideDecimalsIfZero && hasZeroDecimals ? 0 : config.fractionDigits;

  try {
    const formatter = new Intl.NumberFormat(config.locale, {
      style: showSymbol ? 'currency' : 'decimal',
      currency: config.code,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    return formatter.format(major);
  } catch {
    // Fallback string construction if Intl fails
    const formattedNum = major.toLocaleString(config.locale, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    return showSymbol ? `${config.symbol}${formattedNum}` : formattedNum;
  }
}

/**
 * Safe integer addition for minor units.
 * @param  {...number} amounts
 * @returns {number}
 */
export function addMinor(...amounts) {
  return amounts.reduce((acc, curr) => {
    const val = Number.isFinite(curr) ? Math.trunc(curr) : 0;
    return acc + val;
  }, 0);
}

/**
 * Safe integer subtraction for minor units.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function subtractMinor(a, b) {
  const valA = Number.isFinite(a) ? Math.trunc(a) : 0;
  const valB = Number.isFinite(b) ? Math.trunc(b) : 0;
  return valA - valB;
}

/**
 * Safe integer multiplication for unit price (minor) * quantity (integer).
 * @param {number} unitPriceMinor
 * @param {number} quantity
 * @returns {number}
 */
export function multiplyMinor(unitPriceMinor, quantity) {
  if (!Number.isFinite(unitPriceMinor) || !Number.isFinite(quantity)) return 0;
  return Math.round(unitPriceMinor * quantity);
}

/**
 * Safe integer division for minor units.
 * @param {number} totalMinor
 * @param {number} divisor
 * @returns {number}
 */
export function divideMinor(totalMinor, divisor) {
  if (!Number.isFinite(totalMinor) || !Number.isFinite(divisor) || divisor === 0) return 0;
  return Math.round(totalMinor / divisor);
}

/**
 * Proportionally allocates an amount across shares, guaranteeing that
 * the sum of returned allocations strictly equals the input totalMinor
 * by distributing any rounding residue to the largest share.
 *
 * @param {number} totalMinor - Total amount to allocate
 * @param {number[]} weights - Positive integer or float weights (e.g. quantities)
 * @returns {number[]} Allocated minor amounts
 */
export function allocateMinor(totalMinor, weights = []) {
  if (!weights.length || totalMinor === 0) return weights.map(() => 0);
  const sumWeights = weights.reduce((acc, w) => acc + (w > 0 ? w : 0), 0);
  if (sumWeights === 0) return weights.map(() => 0);

  let allocatedSum = 0;
  const allocations = weights.map((w) => {
    if (w <= 0) return 0;
    const share = Math.floor((totalMinor * w) / sumWeights);
    allocatedSum += share;
    return share;
  });

  // Distribute residue
  let remainder = totalMinor - allocatedSum;
  if (remainder > 0) {
    // Find highest weight index to allocate remainder
    let maxIdx = 0;
    for (let i = 1; i < weights.length; i++) {
      if (weights[i] > weights[maxIdx]) maxIdx = i;
    }
    allocations[maxIdx] += remainder;
  }

  return allocations;
}

