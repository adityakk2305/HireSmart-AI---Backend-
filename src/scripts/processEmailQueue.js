import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB, closeDB } from "../config/db.js";
import { processPendingEmails, processRetryableEmails } from "../services/emailQueueService.js";

dotenv.config();

const run = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required to process email queue");
  }

  await connectDB(process.env.MONGODB_URI);
  const pending = await processPendingEmails();
  const retryable = await processRetryableEmails();

  console.log(`Email queue summary: pending=${pending.total}, retryable=${retryable.total}, sent=${pending.sent + retryable.sent}, failed=${pending.failed + retryable.failed}`);
};

run()
  .catch((error) => {
    console.error(`Email queue failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await closeDB();
    }
  });
