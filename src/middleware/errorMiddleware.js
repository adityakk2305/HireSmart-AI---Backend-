import mongoose from "mongoose";
import env, { isProduction } from "../config/env.js";
import { deleteStoredFile } from "../services/fileStorageService.js";
import ApiError from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

const sanitizeMessage = (message = "Internal server error") =>
  message
    .replace(/[A-Za-z]:\\[^\s)]+/g, "[path]")
    .replace(/mongodb(\+srv)?:\/\/[^\s]+/gi, "[mongodb-uri]");

const normalizeError = (error) => {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof mongoose.Error.CastError) {
    return new ApiError(400, "Invalid resource identifier");
  }

  if (error?.code === 11000) {
    const fields = Object.keys(error.keyValue || {});
    return new ApiError(409, `Duplicate value${fields.length ? ` for ${fields.join(", ")}` : ""}`, [
      error.keyValue
    ]);
  }

  if (error instanceof mongoose.Error.ValidationError) {
    const validationErrors = Object.values(error.errors).map((item) => ({
      field: item.path,
      message: item.message
    }));

    return new ApiError(400, "Validation failed", validationErrors);
  }

  return new ApiError(error.statusCode || 500, error.message || "Internal server error", [], false);
};

export const errorMiddleware = (error, req, res, _next) => {
  if (req.file?.fieldname === "resume" && req.file?.filename) {
    deleteStoredFile(req.file.filename).catch(() => {});
  }

  const normalizedError = normalizeError(error);
  const statusCode = normalizedError.statusCode || 500;
  const isServerError = statusCode >= 500;
  const message =
    isProduction && isServerError ? "Internal server error" : sanitizeMessage(normalizedError.message);

  if (!isProduction && isServerError) {
    console.error(`[${env.nodeEnv}] ${sanitizeMessage(error.stack || error.message)}`);
  }

  logger.error("API error response", {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    statusCode,
    message,
    stack: isProduction ? undefined : sanitizeMessage(error.stack || "")
  });

  res.status(statusCode).json({
    success: false,
    message,
    requestId: req.requestId,
    errorCode: normalizedError.errorCode || (isServerError ? "INTERNAL_SERVER_ERROR" : "REQUEST_ERROR"),
    timestamp: new Date().toISOString(),
    errors: normalizedError.errors
  });
};
