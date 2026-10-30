import { GroupBuyPool } from "../models/GroupBuyPool.model.js";
import { Contribution } from "../models/Contribution.model.js";
import { freezePriceSnapshot } from "../services/pricing/snapshot.service.js";
import clockService from "../services/clock/clock.service.js";
import env from "../config/env.js";

/**
 * Evaluates open recruiting pools against their 72-hour deadlines.
 * If total eligible quantity >= targetMoq, triggers early lock and freezes snapshot.
 * If total eligible quantity < targetMoq and 72h expired, locks into 24h under-MOQ decision window.
 *
 * @param {ClientSession|null} [session=null]
 * @returns {Promise<{ lockedMoqReached: number, lockedUnderMoq: number }>}
 */
export const evaluatePoolDeadlines = async (session = null) => {
  const opts = session ? { session } : {};
  const now = clockService.now();

  // Find all recruiting pools whose 72h deadline has passed
  const expiredPools = await GroupBuyPool.find({
    state: "RECRUITING",
    deadline: { $lte: now },
  }).session(session);

  let lockedMoqReached = 0;
  let lockedUnderMoq = 0;

  for (const pool of expiredPools) {
    // 1. If pool reached target MOQ at or before deadline
    if (pool.totalEligibleQuantity >= pool.targetMoq) {
      pool.state = "AWAITING_APPROVALS";
      pool.lockedAt = now;
      pool.lockReason = "MOQ_REACHED_EARLY";
      await pool.save(opts);

      await freezePriceSnapshot(pool._id, session);
      lockedMoqReached++;
    } else {
      // 2. Pool expired below target MOQ -> Open 24h Buyer Decision Window
      pool.state = "UNDER_MOQ_DECISION_PENDING";
      pool.lockedAt = now;
      pool.lockReason = "EXPIRED_72H_UNDER_MOQ";

      const decisionHours = env.UNDER_MOQ_DECISION_HOURS || 24;
      pool.decisionDeadline = new Date(now.getTime() + decisionHours * 60 * 60 * 1000);
      await pool.save(opts);

      // Set active contributions' underMoqDecision to PENDING
      await Contribution.updateMany(
        { poolId: pool._id, state: { $in: ["ACTIVE", "PENDING_PAYMENT"] } },
        { $set: { underMoqDecision: "PENDING" } },
        opts
      );

      lockedUnderMoq++;
    }
  }

  return { lockedMoqReached, lockedUnderMoq };
};

export default {
  evaluatePoolDeadlines,
};

