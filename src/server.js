import http from "http";
import mongoose from "mongoose";
import app from "./app.js";
import { closeDB, connectDB } from "./config/db.js";
import env, { validateEnv } from "./config/env.js";
import { closeLogStreams, logger } from "./utils/logger.js";

let httpServer;

const shutdown = async (signal = "shutdown") => {
  logger.app("info", `${signal} received. Closing HireSmart AI API...`);

  if (httpServer) {
    httpServer.close(async () => {
      await closeDB();
      await closeLogStreams();
      process.exit(0);
    });
  } else {
    await closeDB();
    await closeLogStreams();
    process.exit(0);
  }
};

const startServer = async () => {
  validateEnv();
  await connectDB(env.mongoUri);

  httpServer = http.createServer(app);
  httpServer.listen(env.port, () => {
    logger.app("info", `HireSmart AI API running at http://localhost:${env.port}`, {
      environment: env.nodeEnv,
      version: env.appVersion
    });
  });
};

process.on("unhandledRejection", async (reason) => {
  logger.error("Unhandled rejection", {
    message: reason instanceof Error ? reason.message : String(reason)
  });
  await shutdown("unhandledRejection");
});

process.on("uncaughtException", async (error) => {
  logger.error("Uncaught exception", {
    message: error.message,
    stack: error.stack
  });
  await shutdown("uncaughtException");
});

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

startServer().catch(async (error) => {
  logger.error("Startup failed", {
    message: error.message,
    stack: error.stack
  });
  if (mongoose.connection.readyState !== 0) {
    await closeDB();
  }
  await closeLogStreams();
  process.exit(1);
});
