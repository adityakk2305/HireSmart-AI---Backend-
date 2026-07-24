import crypto from "crypto";
import { getSafeMailConfig, verifyMailTransport, createMailTransport } from "../config/mail.js";
import env from "../config/env.js";
import EmailLog from "../models/EmailLog.js";
import EmailTemplate from "../models/EmailTemplate.js";
import ApiError from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";
import { buildTemplateContext, getOwnedTemplate, renderEmailTemplate } from "./emailTemplateService.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateRecipient = (email) => {
  if (!email || !emailPattern.test(String(email).trim())) {
    throw new ApiError(400, "Recipient email is invalid");
  }
  return String(email).trim().toLowerCase();
};

const address = (email, name = "") => ({ email: validateRecipient(email), name: String(name || "").trim() });

export const generateIdempotencyKey = (...parts) =>
  parts.filter(Boolean).map((part) => String(part).replace(/\s+/g, "-")).join(":").slice(0, 300) ||
  crypto.randomBytes(16).toString("hex");

const normalizeDeliveryError = (error) => {
  const code = String(error?.code || error?.responseCode || "EMAIL_SEND_FAILED");
  const message = String(error?.message || "Email delivery failed")
    .replace(/pass(word)?=[^\s]+/gi, "password=[hidden]")
    .replace(/SMTP_PASSWORD[^\s]+/gi, "SMTP_PASSWORD=[hidden]")
    .slice(0, 1000);
  const retryable =
    /ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|RATE|TIMEOUT|TEMP|421|450|451|452/i.test(`${code} ${message}`) &&
    !/invalid recipient|bad recipient|550|551|553|unauthorized|auth/i.test(`${code} ${message}`);

  return { code, message, retryable };
};

export const buildMailOptions = (log) => ({
  from: log.from.name ? `"${log.from.name.replace(/"/g, "'")}" <${log.from.email}>` : log.from.email,
  to: log.to.map((item) => (item.name ? `"${item.name.replace(/"/g, "'")}" <${item.email}>` : item.email)),
  cc: log.cc?.map((item) => (item.name ? `"${item.name.replace(/"/g, "'")}" <${item.email}>` : item.email)),
  bcc: log.bcc?.map((item) => (item.name ? `"${item.name.replace(/"/g, "'")}" <${item.email}>` : item.email)),
  replyTo: log.metadata?.replyTo || undefined,
  subject: log.subject,
  html: log.htmlBody,
  text: log.textBody
});

export const createEmailLog = async ({
  company,
  user,
  candidate = null,
  job = null,
  interview = null,
  template = null,
  emailType = "Manual",
  to,
  cc = [],
  bcc = [],
  subject,
  htmlBody,
  textBody,
  provider = null,
  scheduledFor = new Date(),
  automationKey = "",
  idempotencyKey = "",
  metadata = {},
  triggeredByType = "HR"
}) => {
  if (idempotencyKey) {
    const existing = await EmailLog.findOne({ companyId: company._id, idempotencyKey }).select("+bcc");
    if (existing && ["Pending", "Processing", "Sent"].includes(existing.status)) {
      return { log: existing, duplicate: true };
    }
  }

  const settings = company.emailSettings || {};
  const safeConfig = getSafeMailConfig();
  const selectedProvider = provider || settings.provider || safeConfig.provider;
  const effectiveProvider = selectedProvider === "smtp" && safeConfig.smtpConfigured ? "smtp" : safeConfig.provider;
  const fromEmail = settings.senderEmail || env.mailFromEmail;
  const fromName = settings.senderName || env.mailFromName;
  const recipients = Array.isArray(to) ? to : [to];

  if (!recipients.length) {
    throw new ApiError(400, "At least one recipient is required");
  }

  const log = await EmailLog.create({
    companyId: company._id,
    candidateId: candidate?._id || null,
    jobId: job?._id || null,
    interviewId: interview?._id || null,
    templateId: template?._id || null,
    emailType,
    provider: effectiveProvider,
    from: address(fromEmail, fromName),
    to: recipients.map((item) => (typeof item === "string" ? address(item) : address(item.email, item.name))),
    cc: cc.map((item) => (typeof item === "string" ? address(item) : address(item.email, item.name))),
    bcc: bcc.map((item) => (typeof item === "string" ? address(item) : address(item.email, item.name))),
    subject,
    htmlBody,
    textBody,
    status: "Pending",
    attempts: 0,
    maxAttempts: env.mailMaxRetries,
    scheduledFor,
    triggeredBy: user?._id || null,
    triggeredByType,
    automationKey,
    idempotencyKey,
    metadata: {
      ...metadata,
      replyTo: settings.replyToEmail || env.mailReplyTo || fromEmail,
      mockMode: effectiveProvider === "mock"
    },
    createdBy: user?._id || null
  });

  return { log, duplicate: false };
};

export const updateEmailLogSuccess = async (log, result) => {
  log.status = "Sent";
  log.sentAt = new Date();
  log.failedAt = null;
  log.nextRetryAt = null;
  log.providerMessageId = result.messageId || "";
  log.errorCode = "";
  log.errorMessage = "";
  log.retryHistory.push({ attempt: log.attempts, status: "Sent" });
  await log.save();
  return log;
};

export const updateEmailLogFailure = async (log, error) => {
  const normalized = normalizeDeliveryError(error);
  log.status = "Failed";
  log.failedAt = new Date();
  log.errorCode = normalized.code;
  log.errorMessage = normalized.message;
  log.nextRetryAt =
    normalized.retryable && log.attempts < log.maxAttempts
      ? new Date(Date.now() + env.mailRetryDelayMs * Math.max(log.attempts, 1))
      : null;
  log.retryHistory.push({
    attempt: log.attempts,
    status: "Failed",
    errorCode: normalized.code,
    errorMessage: normalized.message
  });
  await log.save();
  return log;
};

export const sendMockEmail = async (log) => {
  if (log.metadata?.forceFail) {
    throw new Error("Mock forced delivery failure");
  }

  logger.app("info", "Mock email delivery completed", {
    emailType: log.emailType,
    recipientCount: log.to.length,
    emailLogId: log._id
  });
  return {
    messageId: `mock-email-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`
  };
};

export const sendSmtpEmail = async (log) => {
  const transport = createMailTransport();
  const result = await transport.sendMail(buildMailOptions(log));
  return { messageId: result.messageId || "" };
};

export const sendEmail = async (emailLogId) => {
  const log = await EmailLog.findById(emailLogId).select("+bcc");
  if (!log) throw new ApiError(404, "Email log not found");
  if (log.status === "Sent") return log;
  if (log.status === "Cancelled") throw new ApiError(400, "Cancelled emails cannot be sent");

  const now = new Date();
  if (log.scheduledFor && log.scheduledFor > now) {
    return log;
  }

  log.status = "Processing";
  log.attempts += 1;
  await log.save();

  try {
    const result = log.provider === "smtp" ? await sendSmtpEmail(log) : await sendMockEmail(log);
    return updateEmailLogSuccess(log, result);
  } catch (error) {
    return updateEmailLogFailure(log, error);
  }
};

export const sendTemplateEmail = async ({
  company,
  user,
  candidate,
  job,
  interview = null,
  templateId = null,
  category,
  emailType,
  scheduledFor = new Date(),
  automationKey = "",
  idempotencyKey = "",
  metadata = {},
  sendNow = true,
  to = null,
  customSubject = "",
  customHtmlBody = "",
  customTextBody = ""
}) => {
  const template = templateId
    ? await getOwnedTemplate(company._id, templateId)
    : await EmailTemplate.findOne({ companyId: company._id, category, isActive: true }).sort({ isDefault: -1, updatedAt: -1 });

  if (!template && !customSubject) {
    throw new ApiError(404, "Email template not found");
  }

  if (template && !template.isActive) {
    throw new ApiError(400, "Email template is inactive");
  }

  const context = buildTemplateContext({ company, candidate, job, interview, user });
  const rendered = customSubject
    ? renderEmailTemplate({
        subject: customSubject,
        htmlBody: customHtmlBody || `<p>${customTextBody || customSubject}</p>`,
        textBody: customTextBody || "",
        context
      })
    : renderEmailTemplate({
        subject: template.subject,
        htmlBody: template.htmlBody,
        textBody: template.textBody,
        context
      });

  const { log, duplicate } = await createEmailLog({
    company,
    user,
    candidate,
    job,
    interview,
    template,
    emailType,
    to: to || { email: candidate.email, name: candidate.fullName },
    subject: rendered.subject,
    htmlBody: rendered.htmlBody,
    textBody: rendered.textBody,
    scheduledFor,
    automationKey,
    idempotencyKey,
    metadata: { ...metadata, usedVariables: rendered.usedVariables }
  });

  if (duplicate) {
    return { log, duplicate: true, sent: log.status === "Sent" };
  }

  if (!sendNow || new Date(scheduledFor) > new Date()) {
    return { log, duplicate: false, sent: false };
  }

  const sentLog = await sendEmail(log._id);
  return { log: sentLog, duplicate: false, sent: sentLog.status === "Sent" };
};

export const retryEmail = async (userId, companyId, emailLogId) => {
  const log = await EmailLog.findOne({ _id: emailLogId, companyId }).select("+bcc");
  if (!log) throw new ApiError(404, "Email log not found");
  if (log.status === "Sent") throw new ApiError(400, "Sent emails cannot be retried");
  if (log.status === "Processing") throw new ApiError(409, "Email is already processing");
  if (log.attempts >= log.maxAttempts) throw new ApiError(400, "Retry limit exceeded");
  log.status = "Pending";
  log.nextRetryAt = null;
  log.failedAt = null;
  log.errorCode = "";
  log.errorMessage = "";
  log.triggeredBy = userId;
  await log.save();
  return sendEmail(log._id);
};

export const cancelQueuedEmail = async (companyId, emailLogId) => {
  const log = await EmailLog.findOne({ _id: emailLogId, companyId });
  if (!log) throw new ApiError(404, "Email log not found");
  if (log.status === "Sent") throw new ApiError(400, "Sent emails cannot be cancelled");
  if (log.status === "Processing") throw new ApiError(409, "Processing emails cannot be cancelled");
  log.status = "Cancelled";
  await log.save();
  return log;
};

export const sendTestEmail = async ({ company, user, to, forceFail = false }) => {
  const safeConfig = getSafeMailConfig();
  const subject = `HireSmart AI ${safeConfig.provider.toUpperCase()} test email`;
  const { log } = await createEmailLog({
    company,
    user,
    emailType: "Test Email",
    to: { email: to, name: user.name },
    subject,
    htmlBody: "<p>This is a safe HireSmart AI test email.</p>",
    textBody: "This is a safe HireSmart AI test email.",
    metadata: { forceFail, providerStatus: safeConfig }
  });
  return sendEmail(log._id);
};

export const verifyEmailConfiguration = () => verifyMailTransport();
