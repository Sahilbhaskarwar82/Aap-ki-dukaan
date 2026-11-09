import env from "./config/env.js";
import connectDB from "./config/db.js";
import app from "./app.js";

const startServer = async () => {
  try {
    await connectDB();
    const port = env.PORT || 8000;

    // Initialize BullMQ background email/OTP worker
    try {
      await import("./workers/email.worker.js");
      console.log("🚀 [Workers] Email & OTP background worker initialized");
    } catch (workerErr) {
      console.warn("⚠️ [Workers] Notice: Email background worker initialization:", workerErr.message);
    }

    const server = app.listen(port, () => {
      console.log(`🚀 Aap Ki Dukan API server listening on port ${port} [env=${env.NODE_ENV}]`);
    });

    const shutdown = async (signal) => {
      console.log(`\nReceived ${signal}. Gracefully shutting down...`);
      try {
        const { emailWorker } = await import("./workers/email.worker.js");
        if (emailWorker) await emailWorker.close();
      } catch {}
      server.close(() => {
        console.log("HTTP server closed.");
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (err) {
    console.error("FATAL: Failed to start server:", err);
    process.exit(1);
  }
};

// Standalone execution: start server listener. On Vercel, app instance is exported for serverless execution.
if (process.env.VERCEL !== "1") {
  startServer();
}

export default app;
