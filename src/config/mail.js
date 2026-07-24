import nodemailer from "nodemailer";
import env, { isDevelopment, isProduction } from "./env.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const supportedProviders = ["mock", "smtp"];

const sanitizeProvider = (provider = env.mailProvider) => {
  const normalized = String(provider || "mock").toLowerCase();
  return supportedProviders.includes(normalized) ? normalized : "mock";
};

const smtpConfigured = () =>
  Boolean(env.smtpHost && env.smtpPort && env.smtpUser && env.smtpPassword && emailPattern.test(env.mailFromEmail));

export const getSafeMailConfig = () => {
  const requestedProvider = sanitizeProvider();
  const smtpReady = smtpConfigured();
  const provider = requestedProvider === "smtp" && !smtpReady && isDevelopment ? "mock" : requestedProvider;

  return {
    requestedProvider,
    provider,
    supportedProviders,
    fromName: env.mailFromName,
    fromEmail: env.mailFromEmail,
    replyTo: env.mailReplyTo,
    smtpConfigured: smtpReady,
    mockMode: provider === "mock",
    requestTimeoutMs: env.mailRequestTimeoutMs,
    maxRetries: env.mailMaxRetries,
    retryDelayMs: env.mailRetryDelayMs,
    batchLimit: env.emailBatchLimit,
    batchConcurrency: env.emailBatchConcurrency,
    warning:
      requestedProvider === "smtp" && !smtpReady && isDevelopment
        ? "SMTP is not fully configured. Development mode is using the mock mail provider."
        : null
  };
};

export const validateMailConfig = (provider = env.mailProvider) => {
  const normalized = sanitizeProvider(provider);
  const errors = [];

  if (!supportedProviders.includes(normalized)) {
    errors.push("Unsupported mail provider");
  }

  if (!emailPattern.test(env.mailFromEmail)) {
    errors.push("MAIL_FROM_EMAIL must be a valid email address");
  }

  if (env.mailReplyTo && !emailPattern.test(env.mailReplyTo)) {
    errors.push("MAIL_REPLY_TO must be a valid email address");
  }

  if (normalized === "smtp") {
    if (!env.smtpHost) errors.push("SMTP_HOST is required for SMTP provider");
    if (!Number.isInteger(env.smtpPort) || env.smtpPort <= 0 || env.smtpPort > 65535) {
      errors.push("SMTP_PORT must be a valid port");
    }
    if (!env.smtpUser) errors.push("SMTP_USER is required for SMTP provider");
    if (!env.smtpPassword) errors.push("SMTP_PASSWORD is required for SMTP provider");
  }

  if (errors.length && isProduction) {
    throw new Error(`Mail configuration error: ${errors.join("; ")}`);
  }

  return {
    valid: errors.length === 0 || (isDevelopment && normalized === "smtp"),
    errors,
    safeConfig: getSafeMailConfig()
  };
};

export const createMailTransport = () => {
  const safeConfig = getSafeMailConfig();

  if (safeConfig.provider === "mock") {
    return null;
  }

  validateMailConfig("smtp");

  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPassword
    },
    connectionTimeout: env.mailRequestTimeoutMs,
    greetingTimeout: env.mailRequestTimeoutMs,
    socketTimeout: env.mailRequestTimeoutMs,
    tls: {
      rejectUnauthorized: isProduction
    }
  });
};

export const verifyMailTransport = async () => {
  const config = getSafeMailConfig();

  if (config.provider === "mock") {
    return {
      ok: true,
      provider: "mock",
      message: config.warning || "Mock mail provider is active. No real email will be sent."
    };
  }

  const transport = createMailTransport();
  await transport.verify();
  return { ok: true, provider: "smtp", message: "SMTP configuration verified" };
};
