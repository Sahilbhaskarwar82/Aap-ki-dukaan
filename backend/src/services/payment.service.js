/**
 * Payment Service Proxy
 *
 * Re-exports the authoritative implementation from ./payments/payment.service.js.
 * Preserves backwards compatibility for all existing imports.
 */

export * from "./payments/payment.service.js";
export { default } from "./payments/payment.service.js";
