import env from "./config/env.js";
import connectDB from "./config/db.js";
import app from "./app.js";

const startServer = async () => {
  try {
    await connectDB();
    const port = env.PORT || 8000;

    const server = app.listen(port, () => {
      console.log(`🚀 Aap Ki Dukan API server listening on port ${port} [env=${env.NODE_ENV}]`);
    });

    const shutdown = async (signal) => {
      console.log(`\nReceived ${signal}. Gracefully shutting down...`);
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

startServer();
