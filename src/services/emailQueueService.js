import env from "../config/env.js";
import EmailLog from "../models/EmailLog.js";
import { sendEmail, cancelQueuedEmail as cancelEmailLog } from "./emailService.js";

const PROCESSING_STALE_MINUTES = 15;

const runPool = async (items, worker, concurrency) => {
  const results = [];
  let index = 0;

  const runNext = async () => {
    const current = index;
    index += 1;
    if (current >= items.length) return;
    try {
      results[current] = await worker(items[current]);
    } catch (error) {
      results[current] = { success: false, error: error.message || "Email processing failed" };
    }
    await runNext();
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runNext));
  return results;
};

export const queueEmail = async (log) => log;

export const markStaleProcessingEmails = async () => {
  const staleBefore = new Date(Date.now() - PROCESSING_STALE_MINUTES * 60 * 1000);
  const result = await EmailLog.updateMany(
    { status: "Processing", updatedAt: { $lte: staleBefore } },
    { $set: { status: "Failed", errorCode: "STALE_PROCESSING", errorMessage: "Email processing lock expired" } }
  );
  return result.modifiedCount || 0;
};

export const processEmailLog = async (logId) => {
  const log = await sendEmail(logId);
  return { success: log.status === "Sent", id: log._id.toString(), status: log.status };
};

export const processPendingEmails = async ({ limit = env.emailBatchLimit, concurrency = env.emailBatchConcurrency } = {}) => {
  await markStaleProcessingEmails();
  const now = new Date();
  const logs = await EmailLog.find({
    status: "Pending",
    scheduledFor: { $lte: now }
  })
    .sort({ scheduledFor: 1, createdAt: 1 })
    .limit(Math.min(Number(limit), 100))
    .lean();

  const results = await runPool(logs, (log) => processEmailLog(log._id), Math.max(1, Number(concurrency)));
  return {
    total: logs.length,
    sent: results.filter((item) => item?.status === "Sent").length,
    failed: results.filter((item) => item?.status === "Failed").length,
    results
  };
};

export const processRetryableEmails = async ({ limit = env.emailBatchLimit, concurrency = env.emailBatchConcurrency } = {}) => {
  const now = new Date();
  const logs = await EmailLog.find({
    status: "Failed",
    nextRetryAt: { $lte: now, $ne: null },
    $expr: { $lt: ["$attempts", "$maxAttempts"] }
  })
    .sort({ nextRetryAt: 1 })
    .limit(Math.min(Number(limit), 100));

  logs.forEach((log) => {
    log.status = "Pending";
    log.nextRetryAt = null;
  });
  await Promise.all(logs.map((log) => log.save()));

  const results = await runPool(logs, (log) => processEmailLog(log._id), Math.max(1, Number(concurrency)));
  return {
    total: logs.length,
    sent: results.filter((item) => item?.status === "Sent").length,
    failed: results.filter((item) => item?.status === "Failed").length,
    results
  };
};

export const cancelQueuedEmail = (companyId, emailLogId) => cancelEmailLog(companyId, emailLogId);
