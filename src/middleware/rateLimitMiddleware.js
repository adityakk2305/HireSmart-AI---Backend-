import rateLimit from "express-rate-limit";
import { isDevelopment } from "../config/env.js";

const createLimiter = ({ windowMs, limit, message, errorCode }) =>
  rateLimit({
    windowMs,
    limit: isDevelopment ? Math.max(limit, 1000) : limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res, _next, options) => {
      const retryAfterSeconds = Math.ceil(windowMs / 1000);
      res.setHeader("Retry-After", retryAfterSeconds);
      res.status(options.statusCode).json({
        success: false,
        message,
        requestId: req.requestId,
        errorCode,
        timestamp: new Date().toISOString()
      });
    }
  });

export const apiLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 300,
  message: "Too many API requests. Please try again later.",
  errorCode: "RATE_LIMIT_API"
});

export const authLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 5,
  message: "Too many authentication attempts. Please try again later.",
  errorCode: "RATE_LIMIT_AUTH"
});

export const loginLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 5,
  message: "Too many login attempts. Please try again later.",
  errorCode: "RATE_LIMIT_LOGIN"
});

export const registerLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: "Too many registration attempts. Please try again later.",
  errorCode: "RATE_LIMIT_REGISTER"
});

export const forgotPasswordLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  message: "Too many password reset requests. Please try again later.",
  errorCode: "RATE_LIMIT_PASSWORD_RESET"
});

export const resumeUploadLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  message: "Too many resume upload requests. Please try again later.",
  errorCode: "RATE_LIMIT_RESUME_UPLOAD"
});

export const aiScreeningLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  message: "Too many AI screening requests. Please try again later.",
  errorCode: "RATE_LIMIT_AI_SCREENING"
});

export const interviewGenerationLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  message: "Too many interview question generation requests. Please try again later.",
  errorCode: "RATE_LIMIT_INTERVIEW_AI"
});

export const emailSendingLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 50,
  message: "Too many email sending requests. Please try again later.",
  errorCode: "RATE_LIMIT_EMAIL"
});

export const analyticsLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 120,
  message: "Too many analytics requests. Please try again later.",
  errorCode: "RATE_LIMIT_ANALYTICS"
});

export const adminLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 500,
  message: "Too many admin requests. Please try again later.",
  errorCode: "RATE_LIMIT_ADMIN"
});

export const publicApplicationLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: "Too many application attempts. Please try again later.",
  errorCode: "RATE_LIMIT_APPLICATION"
});

export const statusLookupLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: "Too many status lookup attempts. Please try again later.",
  errorCode: "RATE_LIMIT_STATUS_LOOKUP"
});
