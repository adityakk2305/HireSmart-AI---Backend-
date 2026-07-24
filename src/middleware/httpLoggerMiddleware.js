import { logger } from "../utils/logger.js";

export const httpLoggerMiddleware = (req, res, next) => {
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const statusCode = res.statusCode;
    const channel = statusCode >= 500 ? "error" : "http";
    const message = statusCode >= 500 ? "HTTP request failed" : "HTTP request";

    logger[channel](message, {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      ip: req.ip,
      userId: req.user?.id,
      role: req.user?.role
    });
  });

  next();
};
