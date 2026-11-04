import rateLimit from "express-rate-limit";

// In test and development environments, allow requests to proceed without rate limiting
const skipInTest = () =>
  process.env.NODE_ENV === "test" ||
  process.env.NODE_ENV === "development" ||
  process.env.SKIP_RATE_LIMIT === "true";

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // Generous limit for development & evaluation
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
  max: 1000, // Generous login/register limit in development
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
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    statusCode: 429,
    success: false,
    message: "Too many file upload requests, please try again later.",
    errors: ["UPLOAD_RATE_LIMIT_EXCEEDED"],
  },
});

export const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    statusCode: 429,
    success: false,
    message: "Too many payment operations, please try again after 15 minutes.",
    errors: ["PAYMENT_RATE_LIMIT_EXCEEDED"],
  },
});

export const tatkalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
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

export default {
  apiLimiter,
  authLimiter,
  uploadLimiter,
  paymentLimiter,
  tatkalRateLimiter,
};
