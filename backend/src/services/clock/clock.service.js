/**
 * Injectable Server Clock Service (PRK-02)
 *
 * Provides a deterministic, test-controllable time source across the application.
 * All group-buy pool 72-hour deadlines, 24-hour under-MOQ decision windows,
 * and price snapshot timestamps MUST query clockService.now() rather than raw Date.now().
 */

class ClockService {
  constructor() {
    this.offsetMs = 0;
    this.fixedTime = null;
  }

  /**
   * Returns the current date according to the clock service.
   * If fixedTime is set, returns that fixed date.
   * Otherwise returns real wall-clock time plus any accumulated offsetMs.
   *
   * @returns {Date}
   */
  now() {
    if (this.fixedTime !== null) {
      return new Date(this.fixedTime.getTime());
    }
    return new Date(Date.now() + this.offsetMs);
  }

  /**
   * Returns the current timestamp in milliseconds.
   * @returns {number}
   */
  nowMs() {
    return this.now().getTime();
  }

  /**
   * Validates that clock mutation is only permitted in test or development environments.
   * @private
   */
  _assertMutable() {
    const env = process.env.NODE_ENV || "development";
    if (env === "production") {
      throw new Error("ClockService time manipulation is strictly forbidden in production mode.");
    }
  }

  /**
   * Advances the internal clock offset by the given milliseconds.
   *
   * @param {number} ms - Milliseconds to advance (positive or negative)
   * @returns {Date} The new simulated current date
   */
  advanceTimeByMs(ms) {
    this._assertMutable();
    if (typeof ms !== "number" || isNaN(ms)) {
      throw new TypeError("advanceTimeByMs requires a valid number of milliseconds.");
    }

    if (this.fixedTime !== null) {
      this.fixedTime = new Date(this.fixedTime.getTime() + ms);
      return new Date(this.fixedTime.getTime());
    }

    this.offsetMs += ms;
    return this.now();
  }

  /**
   * Convenience helper to advance time by hours (e.g. 72h or 24h).
   *
   * @param {number} hours
   * @returns {Date}
   */
  advanceTimeByHours(hours) {
    return this.advanceTimeByMs(hours * 60 * 60 * 1000);
  }

  /**
   * Convenience helper to advance time by days.
   *
   * @param {number} days
   * @returns {Date}
   */
  advanceTimeByDays(days) {
    return this.advanceTimeByHours(days * 24);
  }

  /**
   * Freezes the clock at a specific ISO timestamp or Date object.
   *
   * @param {string|Date} isoStringOrDate
   * @returns {Date}
   */
  setFixedTime(isoStringOrDate) {
    this._assertMutable();
    const d = new Date(isoStringOrDate);
    if (isNaN(d.getTime())) {
      throw new RangeError("Invalid date passed to setFixedTime.");
    }
    this.fixedTime = d;
    this.offsetMs = 0;
    return new Date(this.fixedTime.getTime());
  }

  /**
   * Resets any offset or fixed time back to the real wall-clock time.
   */
  reset() {
    this._assertMutable();
    this.offsetMs = 0;
    this.fixedTime = null;
  }
}

// Singleton instance
export const clockService = new ClockService();
export default clockService;

