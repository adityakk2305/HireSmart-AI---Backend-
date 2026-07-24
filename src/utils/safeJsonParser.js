import ApiError from "./ApiError.js";

export const removeMarkdownCodeFences = (value = "") =>
  String(value)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

export const extractJsonObject = (value = "") => {
  const cleaned = removeMarkdownCodeFences(value);
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new ApiError(502, "AI provider did not return JSON");
  }

  return cleaned.slice(firstBrace, lastBrace + 1);
};

export const repairMinorJsonIssues = (value = "") =>
  value
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]");

export const safelyParseJson = (value = "") => {
  const json = repairMinorJsonIssues(extractJsonObject(value));

  try {
    return JSON.parse(json);
  } catch {
    throw new ApiError(502, "AI provider returned invalid JSON");
  }
};

export const validateParsedJson = (schema, value) => {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    throw new ApiError(502, "AI provider returned unsupported resume structure");
  }

  return parsed.data;
};
