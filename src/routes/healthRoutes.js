import { Router } from "express";
import os from "os";
import mongoose from "mongoose";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import env from "../config/env.js";

const router = Router();

const getMongoStatus = () => {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  return {
    ok: mongoose.connection.readyState === 1,
    state: states[mongoose.connection.readyState] || "unknown",
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null
  };
};

const getProviderStatus = () => ({
  mail: {
    ok: env.mailProvider === "mock" || Boolean(env.smtpHost && env.smtpUser && env.smtpPassword),
    provider: env.mailProvider,
    mode: env.mailProvider === "mock" ? "mock" : "smtp"
  },
  aiProviders: {
    ok: true,
    active: (process.env.AI_PROVIDER || "mock").toLowerCase(),
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY)
  },
  monitoring: {
    sentryConfigured: Boolean(env.sentryDsn),
    otelConfigured: Boolean(env.otelExporterOtlpEndpoint),
    prometheusEnabled: env.prometheusEnabled
  }
});

const getSystemStatus = () => {
  const memory = process.memoryUsage();

  return {
    api: {
      ok: true,
      environment: env.nodeEnv,
      version: env.appVersion,
      uptime: Number(process.uptime().toFixed(2)),
      timestamp: new Date().toISOString()
    },
    mongodb: getMongoStatus(),
    ...getProviderStatus(),
    system: {
      memory: {
        rssMb: Number((memory.rss / 1024 / 1024).toFixed(2)),
        heapUsedMb: Number((memory.heapUsed / 1024 / 1024).toFixed(2)),
        heapTotalMb: Number((memory.heapTotal / 1024 / 1024).toFixed(2))
      },
      cpu: {
        loadAverage: os.loadavg(),
        cores: os.cpus().length
      },
      platform: os.platform(),
      nodeVersion: process.version
    }
  };
};

const sendHealth = (res, statusCode, message, data) => {
  res.status(statusCode).json(new ApiResponse(statusCode, message, data));
};

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const status = getSystemStatus();
    sendHealth(res, status.mongodb.ok ? 200 : 503, "HireSmart AI API health", status);
  })
);

router.get(
  "/live",
  asyncHandler(async (_req, res) => {
    sendHealth(res, 200, "HireSmart AI API is live", {
      api: {
        ok: true,
        uptime: Number(process.uptime().toFixed(2)),
        timestamp: new Date().toISOString(),
        version: env.appVersion
      }
    });
  })
);

router.get(
  "/ready",
  asyncHandler(async (_req, res) => {
    const status = getSystemStatus();
    const ready = status.mongodb.ok && status.mail.ok && status.aiProviders.ok;
    sendHealth(res, ready ? 200 : 503, ready ? "HireSmart AI API is ready" : "HireSmart AI API is not ready", status);
  })
);

export default router;
