import mongoose from "mongoose";
import { logger } from "../utils/logger.js";

const getSafeHost = (mongoUri) => {
  try {
    const parsed = new URL(mongoUri);
    return parsed.host;
  } catch {
    return "configured MongoDB host";
  }
};

export const connectDB = async (mongoUri) => {
  try {
    const connection = await mongoose.connect(mongoUri, {
      autoIndex: process.env.NODE_ENV !== "production",
      serverSelectionTimeoutMS: 10000
    });

    logger.app("info", `MongoDB connected: ${connection.connection.host}`);
    return connection;
  } catch (error) {
    logger.error("MongoDB connection failed", {
      host: getSafeHost(mongoUri),
      message: error.message
    });
    throw error;
  }
};

export const closeDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
    logger.app("info", "MongoDB connection closed");
  }
};

mongoose.connection.on("disconnected", () => {
  logger.app("warn", "MongoDB disconnected");
});

mongoose.connection.on("error", (error) => {
  logger.error("MongoDB runtime error", { message: error.message });
});
