import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";
import helmet from "helmet";
import morgan from "morgan";
import mongoose from "mongoose";

import env from "./config/env.js";
import clockService from "./services/clock/clock.service.js";

// Middleware
import correlationIdMiddleware from "./middleware/correlationId.middleware.js";
import { apiLimiter } from "./middleware/rateLimiter.middleware.js";
import errorHandler from "./middleware/error.middleware.js";

// Routes
import authRouter from "./routes/auth.routes.js";
import shopRouter from "./routes/shop.routes.js";
import poolRouter from "./routes/pool.routes.js";
import paymentRouter from "./routes/payment.routes.js";
import orderRouter from "./routes/order.routes.js";
import notificationRouter from "./routes/notification.routes.js";
import uploadRouter from "./routes/upload.routes.js";
import supplierRouter, { productRouter, offerRouter } from "./routes/supplier.routes.js";
import requirementRouter from "./routes/requirement.routes.js";

const app = express();

// 1. Attach UUID X-Correlation-Id to all requests and responses (SRU-09)
app.use(correlationIdMiddleware);

// 2. Compress HTTP responses (must be early in middleware stack)
app.use(compression());

// 3. Security HTTP headers via Helmet
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

// 4. HTTP request logging (except in test mode)
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

// 5. CORS restricted to CLIENT_ORIGIN with credentials
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, health checks) or exact match
      if (!origin || origin === env.CLIENT_ORIGIN || process.env.NODE_ENV !== "production") {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS policy."));
    },
    credentials: true,
  })
);

// 6. JSON and URL-encoded body parsing with safe limits
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));

// 7. Cookie parsing
app.use(cookieParser());

// 8. General API rate limiter
app.use("/api", apiLimiter);

// 9. Health Check Endpoint (PRK-01)
app.get("/api/health", (_req, res) => {
  const dbStatusMap = {
    0: "DISCONNECTED",
    1: "CONNECTED",
    2: "CONNECTING",
    3: "DISCONNECTING",
  };

  const dbState = dbStatusMap[mongoose.connection.readyState] || "UNKNOWN";

  return res.status(200).json({
    statusCode: 200,
    success: true,
    message: "Aap Ki Dukan API is healthy",
    data: {
      status: "HEALTHY",
      database: dbState,
      timestamp: clockService.now().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || "development",
    },
  });
});

// 10. Mount application routes
app.use("/api/auth", authRouter);
app.use("/api/shops", shopRouter);
app.use("/api/pools", poolRouter);
app.use("/api/payments", paymentRouter);
app.use("/api/orders", orderRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/uploads", uploadRouter);
app.use("/api/suppliers", supplierRouter);
app.use("/api/products", productRouter);
app.use("/api/offers", offerRouter);
app.use("/api/requirements", requirementRouter);

// 11. Centralized Safe Error Handling Middleware
app.use(errorHandler);

export default app;
