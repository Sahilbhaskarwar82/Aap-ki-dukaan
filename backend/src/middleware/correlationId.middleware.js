import crypto from "crypto";

/**
 * Correlation ID Middleware — SRU-09
 *
 * Attaches a unique X-Correlation-Id to every incoming request and response.
 * Propagates correlation IDs across microservices, scheduled jobs, AI invocations,
 * and immutable AuditLog entries.
 *
 * Implementation (HLD §8, LLD §1):
 *  1. Checks for incoming 'x-correlation-id' or 'x-request-id' headers.
 *  2. If absent or invalid, generates a standard UUID v4.
 *  3. Attaches to req.correlationId.
 *  4. Sets 'X-Correlation-Id' on the outgoing HTTP response header.
 */
export const correlationIdMiddleware = (req, res, next) => {
  const incomingId =
    req.headers["x-correlation-id"] || req.headers["x-request-id"];

  // Use incoming ID if clean string, otherwise generate standard UUID v4
  const correlationId =
    typeof incomingId === "string" && incomingId.trim().length >= 8
      ? incomingId.trim()
      : crypto.randomUUID();

  req.correlationId = correlationId;
  res.setHeader("X-Correlation-Id", correlationId);

  next();
};

export default correlationIdMiddleware;
