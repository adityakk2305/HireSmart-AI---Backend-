import fs from "fs";
import path from "path";
import env, { isProduction } from "../config/env.js";

const sensitiveKeyPattern = /(password|token|secret|credential|api[_-]?key|smtp|authorization|cookie|resume(Content|Text)?|email(Body|Html|Text|Content)|raw(Ai|AI|Response)|recruiterNotes?)/i;
const logDirectory = path.resolve(process.cwd(), env.logDir);
const streams = new Map();

const ensureLogDirectory = () => {
  fs.mkdirSync(logDirectory, { recursive: true });
};

const redact = (value, depth = 0) => {
  if (depth > 6) return "[MaxDepth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}...[truncated]` : value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      sensitiveKeyPattern.test(key) ? "[REDACTED]" : redact(item, depth + 1)
    ])
  );
};

const getStream = (channel) => {
  if (!streams.has(channel)) {
    ensureLogDirectory();
    streams.set(channel, fs.createWriteStream(path.join(logDirectory, `${channel}.log`), { flags: "a" }));
  }

  return streams.get(channel);
};

export const writeLog = (channel, level, message, meta = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...redact(meta)
  };

  const line = `${JSON.stringify(entry)}\n`;
  getStream(channel).write(line);

  if (!isProduction && level !== "debug") {
    const output = level === "error" ? console.error : console.log;
    output(`[${channel}] ${message}`);
  }
};

export const logger = {
  app: (level, message, meta) => writeLog("application", level, message, meta),
  error: (message, meta) => writeLog("errors", "error", message, meta),
  http: (message, meta) => writeLog("http", "info", message, meta),
  security: (level, message, meta) => writeLog("security", level, message, meta)
};

export const closeLogStreams = () =>
  Promise.all(
    [...streams.values()].map(
      (stream) =>
        new Promise((resolve) => {
          stream.end(resolve);
        })
    )
  );
