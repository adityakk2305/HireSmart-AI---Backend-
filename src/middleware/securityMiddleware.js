import zlib from "zlib";
import ApiError from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

const dangerousKeyPattern = /^(\$)|\./;

const sanitizeObject = (value) => {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitizeObject);

  for (const key of Object.keys(value)) {
    if (dangerousKeyPattern.test(key)) {
      delete value[key];
      continue;
    }

    value[key] = sanitizeObject(value[key]);
  }

  return value;
};

export const sanitizeInputs = (req, _res, next) => {
  sanitizeObject(req.body);
  sanitizeObject(req.params);
  sanitizeObject(req.query);
  next();
};

export const preventParameterPollution = (req, _res, next) => {
  const pollutedKeys = Object.entries(req.query || {})
    .filter(([, value]) => Array.isArray(value))
    .map(([key]) => key);

  if (pollutedKeys.length) {
    logger.security("warn", "Rejected HTTP parameter pollution attempt", {
      requestId: req.requestId,
      path: req.originalUrl,
      keys: pollutedKeys
    });
    return next(new ApiError(400, "Duplicate query parameters are not allowed"));
  }

  next();
};

export const securityHeaders = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
};

export const compressionMiddleware = (req, res, next) => {
  const acceptEncoding = req.headers["accept-encoding"] || "";
  const shouldSkip = req.method === "HEAD" || !/\bgzip\b/.test(acceptEncoding) || res.getHeader("Content-Encoding");

  if (shouldSkip) return next();

  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  const chunks = [];

  res.write = (chunk, encoding, callback) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    if (typeof callback === "function") callback();
    return true;
  };

  res.end = (chunk, encoding, callback) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));

    const body = Buffer.concat(chunks);
    const contentType = String(res.getHeader("Content-Type") || "");
    const statusCode = res.statusCode;
    const compressible =
      body.length > 1024 &&
      statusCode >= 200 &&
      statusCode < 300 &&
      /(json|text|javascript|css|svg|html)/i.test(contentType);

    if (!compressible) {
      originalWrite(body);
      return originalEnd(callback);
    }

    zlib.gzip(body, (error, compressed) => {
      if (error) {
        originalWrite(body);
        return originalEnd(callback);
      }

      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Vary", "Accept-Encoding");
      res.setHeader("Content-Length", compressed.length);
      originalWrite(compressed);
      return originalEnd(callback);
    });
  };

  return next();
};
