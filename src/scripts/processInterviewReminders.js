import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB, closeDB } from "../config/db.js";
import { queueEligibleInterviewReminders } from "../services/emailAutomationService.js";
import { processPendingEmails } from "../services/emailQueueService.js";

dotenv.config();

const run = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required to process interview reminders");
  }

  await connectDB(process.env.MONGODB_URI);
  const reminders = await queueEligibleInterviewReminders();
  const processed = await processPendingEmails();

  console.log(`Interview reminder summary: eligible=${reminders.total}, queued=${reminders.queued}, skipped=${reminders.skipped}, failed=${reminders.failed}, processed=${processed.total}`);
};

run()
  .catch((error) => {
    console.error(`Interview reminder processing failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await closeDB();
    }
  });
