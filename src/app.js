import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import env from "./config/env.js";
import { errorMiddleware } from "./middleware/errorMiddleware.js";
import { httpLoggerMiddleware } from "./middleware/httpLoggerMiddleware.js";
import { notFoundMiddleware } from "./middleware/notFoundMiddleware.js";
import { apiLimiter } from "./middleware/rateLimitMiddleware.js";
import { requestContextMiddleware } from "./middleware/requestContextMiddleware.js";
import {
  compressionMiddleware,
  preventParameterPollution,
  sanitizeInputs,
  securityHeaders
} from "./middleware/securityMiddleware.js";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import candidateRoutes from "./routes/candidateRoutes.js";
import companyRoutes from "./routes/companyRoutes.js";
import emailRoutes from "./routes/emailRoutes.js";
import emailTemplateRoutes from "./routes/emailTemplateRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import interviewRoutes from "./routes/interviewRoutes.js";
import jobRoutes from "./routes/jobRoutes.js";
import docsRoutes from "./routes/docsRoutes.js";
import userRoutes from "./routes/userRoutes.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const allowedOrigins = [...new Set([...env.corsOrigins, env.clientUrl, "http://localhost:5173"].filter(Boolean))];

if (env.trustProxy) {
  app.set("trust proxy", 1);
}

app.use(requestContextMiddleware);
app.use(securityHeaders);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        fontSrc: ["'self'", "https:", "data:"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:", "blob:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        upgradeInsecureRequests: env.nodeEnv === "production" ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false,
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" }
  })
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    exposedHeaders: ["X-Request-ID", "Retry-After"]
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());
app.use(sanitizeInputs);
app.use(preventParameterPollution);
app.use(compressionMiddleware);
app.use(httpLoggerMiddleware);
app.use(apiLimiter);

if (env.nodeEnv === "development") {
  app.use("/uploads", express.static(path.resolve(__dirname, "../uploads"), { index: false }));
}

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "HireSmart AI API is running",
    environment: env.nodeEnv
  });
});

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy",
    timestamp: new Date().toISOString()
  });
});

app.use("/health", healthRoutes);
app.use("/api/v1/health", healthRoutes);
app.use("/api/v1/docs", docsRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/analytics", analyticsRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/candidates", candidateRoutes);
app.use("/api/v1/companies", companyRoutes);
app.use("/api/v1/email-templates", emailTemplateRoutes);
app.use("/api/v1/emails", emailRoutes);
app.use("/api/v1/interviews", interviewRoutes);
app.use("/api/v1/jobs", jobRoutes);
app.use("/api/v1/users", userRoutes);

app.use("/api/auth", authRoutes);

app.get("/metrics", (_req, res) => {
  res.type("text/plain").send(`# HELP hiresmart_api_uptime_seconds API process uptime in seconds
# TYPE hiresmart_api_uptime_seconds gauge
hiresmart_api_uptime_seconds ${process.uptime().toFixed(2)}
`);
});

app.use("/api/v2", (_req, res) => {
  res.status(501).json({
    success: false,
    message: "API v2 is reserved for future releases. Use /api/v1.",
    requestId: _req.requestId,
    errorCode: "API_VERSION_NOT_IMPLEMENTED",
    timestamp: new Date().toISOString()
  });
});

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
