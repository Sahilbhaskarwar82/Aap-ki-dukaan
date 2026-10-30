import rateLimit from "express-rate-limit";

// In test environment, allow requests to proceed without rate limiting
const skipInTest = () => process.env.NODE_ENV === "test";

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    statusCode: 429,
    success: false,
    message: "Too many requests from this IP, please try again after 15 minutes.",
    errors: ["RATE_LIMIT_EXCEEDED"],
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 20 login/register attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    statusCode: 429,
    success: false,
    message: "Too many authentication attempts, please try again after 15 minutes.",
    errors: ["AUTH_RATE_LIMIT_EXCEEDED"],
  },
});

export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 upload attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    statusCode: 429,
    success: false,
    message: "Upload rate limit exceeded, please try again later.",
    errors: ["UPLOAD_RATE_LIMIT_EXCEEDED"],
  },
});

export const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    statusCode: 429,
    success: false,
    message: "Payment rate limit exceeded, please try again later.",
    errors: ["PAYMENT_RATE_LIMIT_EXCEEDED"],
  },
});

/**
 * High-concurrency limiter for flash sales / rapid pool booking attempts.
 */
export const tatkalRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 10, // limit each IP to 10 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      statusCode: 429,
      message: "Too many booking attempts from this IP. Please try again after a minute.",
      data: null,
      errors: ["RATE_LIMIT_EXCEEDED"],
    });
  },
});

