import { isDevelopment, isProduction } from "./env.js";
import { logger } from "../utils/logger.js";

const supportedProviders = new Set(["mock", "gemini", "openai"]);

const selectedProvider = (process.env.AI_PROVIDER || "mock").toLowerCase();
const provider = supportedProviders.has(selectedProvider) ? selectedProvider : "mock";

if (!supportedProviders.has(selectedProvider) && isDevelopment) {
  logger.app("warn", "Unsupported AI_PROVIDER. Falling back to mock provider.");
}

const aiConfig = {
  provider,
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-1.5-flash",
  timeoutMs: Number(process.env.AI_REQUEST_TIMEOUT_MS) || 30000,
  maxRetries: Number(process.env.AI_MAX_RETRIES) || 2
};

export const resolveProviderConfig = () => {
  if (aiConfig.provider === "openai" && !aiConfig.openaiApiKey) {
    if (isProduction) throw new Error("OPENAI_API_KEY is required for AI_PROVIDER=openai");
    return { ...aiConfig, provider: "mock", fallbackReason: "Missing OpenAI API key" };
  }

  if (aiConfig.provider === "gemini" && !aiConfig.geminiApiKey) {
    if (isProduction) throw new Error("GEMINI_API_KEY is required for AI_PROVIDER=gemini");
    return { ...aiConfig, provider: "mock", fallbackReason: "Missing Gemini API key" };
  }

  return aiConfig;
};

export default aiConfig;
