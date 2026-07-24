import dotenv from "dotenv";

dotenv.config();

const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || "development",
  appVersion: process.env.APP_VERSION || process.env.npm_package_version || "1.0.0",
  mongoUri: process.env.MONGODB_URI || "",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  corsOrigins: (process.env.CORS_ORIGINS || process.env.CLIENT_URL || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === "true",
  logDir: process.env.LOG_DIR || "logs",
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "",
  jwtAccessExpire: process.env.JWT_ACCESS_EXPIRE || "15m",
  jwtRefreshExpire: process.env.JWT_REFRESH_EXPIRE || "7d",
  cookieSecure: process.env.COOKIE_SECURE === "true",
  cookieSameSite: process.env.COOKIE_SAME_SITE || "lax",
  resetPasswordExpireMinutes: Number(process.env.RESET_PASSWORD_EXPIRE_MINUTES) || 15,
  frontendUrl: process.env.APP_FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173",
  backendUrl: process.env.APP_BACKEND_URL || `http://localhost:${Number(process.env.PORT) || 5000}`,
  mailProvider: (process.env.MAIL_PROVIDER || "mock").toLowerCase(),
  mailFromName: process.env.MAIL_FROM_NAME || "HireSmart AI",
  mailFromEmail: process.env.MAIL_FROM_EMAIL || "no-reply@example.com",
  mailReplyTo: process.env.MAIL_REPLY_TO || "",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT) || 587,
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER || "",
  smtpPassword: process.env.SMTP_PASSWORD || "",
  mailRequestTimeoutMs: Number(process.env.MAIL_REQUEST_TIMEOUT_MS) || 30000,
  mailMaxRetries: Number(process.env.MAIL_MAX_RETRIES) || 3,
  mailRetryDelayMs: Number(process.env.MAIL_RETRY_DELAY_MS) || 5000,
  interviewReminderHours: Number(process.env.INTERVIEW_REMINDER_HOURS) || 24,
  emailBatchLimit: Number(process.env.EMAIL_BATCH_LIMIT) || 50,
  emailBatchConcurrency: Number(process.env.EMAIL_BATCH_CONCURRENCY) || 3,
  sentryDsn: process.env.SENTRY_DSN || "",
  otelExporterOtlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "",
  prometheusEnabled: process.env.PROMETHEUS_ENABLED === "true"
};

export const validateEnv = () => {
  const missing = [];

  if (!env.mongoUri.trim()) {
    missing.push("MONGODB_URI");
  }

  if (!env.jwtAccessSecret.trim()) {
    missing.push("JWT_ACCESS_SECRET");
  }

  if (!env.jwtRefreshSecret.trim()) {
    missing.push("JWT_REFRESH_SECRET");
  }

  if (env.nodeEnv === "production") {
    if (!env.clientUrl.startsWith("https://")) {
      missing.push("CLIENT_URL=https://...");
    }

    if (env.jwtAccessSecret.length < 32) {
      missing.push("JWT_ACCESS_SECRET with at least 32 characters");
    }

    if (env.jwtRefreshSecret.length < 32) {
      missing.push("JWT_REFRESH_SECRET with at least 32 characters");
    }

    if (!env.cookieSecure) {
      missing.push("COOKIE_SECURE=true");
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable${missing.length > 1 ? "s" : ""}: ${missing.join(
        ", "
      )}. Add the value to server/.env before starting the API.`
    );
  }
};

export const isProduction = env.nodeEnv === "production";
export const isDevelopment = env.nodeEnv === "development";

export default env;
