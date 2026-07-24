import fsPromises from "fs/promises";
import path from "path";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import ApiError from "../utils/ApiError.js";
import { parsedResumeSchema } from "../validations/resumeParsingValidation.js";
import { parseResumeWithAI } from "./aiService.js";

const maxExtractedTextLength = 120000;
const scannedTextThreshold = 80;

const ensureFile = async (filePath) => {
  try {
    const stats = await fsPromises.stat(filePath);
    if (!stats.isFile()) throw new Error("not a file");
    return stats;
  } catch {
    throw new ApiError(404, "Stored resume file was not found");
  }
};

export const normalizeExtractedText = (text = "") => {
  const normalized = String(text)
    .replace(/\0/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/^--\s*\d+\s+of\s+\d+\s*--$/gim, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (normalized.length > maxExtractedTextLength) {
    return {
      text: normalized.slice(0, maxExtractedTextLength),
      truncated: true
    };
  }

  return { text: normalized, truncated: false };
};

export const detectScannedOrEmptyPdf = ({ pageCount = 0, text = "" }) => {
  if (pageCount <= 0) return false;
  const alphanumeric = (text.match(/[a-z0-9]/gi) || []).length;
  return text.length < scannedTextThreshold || alphanumeric / Math.max(text.length, 1) < 0.35;
};

export const extractTextFromPdf = async (filePath) => {
  await ensureFile(filePath);

  if (path.extname(filePath).toLowerCase() !== ".pdf") {
    throw new ApiError(400, "Resume file is not a PDF");
  }

  try {
    const buffer = await fsPromises.readFile(filePath);
    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    await parser.destroy();
    const normalized = normalizeExtractedText(parsed.text || "");
    const result = {
      text: normalized.text,
      pageCount: parsed.total || parsed.pages?.length || 0,
      textLength: normalized.text.length,
      isLikelyScanned: false,
      truncated: normalized.truncated
    };
    result.isLikelyScanned = detectScannedOrEmptyPdf(result);
    return result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "Unable to extract text from PDF resume");
  }
};

export const extractTextFromDocx = async (filePath) => {
  await ensureFile(filePath);

  if (path.extname(filePath).toLowerCase() !== ".docx") {
    throw new ApiError(400, "Resume file is not a DOCX");
  }

  try {
    const result = await mammoth.extractRawText({ path: filePath });
    const normalized = normalizeExtractedText(result.value || "");
    return {
      text: normalized.text,
      pageCount: null,
      textLength: normalized.text.length,
      isLikelyScanned: false,
      truncated: normalized.truncated
    };
  } catch {
    throw new ApiError(400, "Unable to extract text from DOCX resume");
  }
};

export const extractResumeText = async (filePath, mimeType = "") => {
  if (mimeType === "application/pdf" || path.extname(filePath).toLowerCase() === ".pdf") {
    return extractTextFromPdf(filePath);
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    path.extname(filePath).toLowerCase() === ".docx"
  ) {
    return extractTextFromDocx(filePath);
  }

  throw new ApiError(400, "Unsupported resume format");
};

export const sanitizeParsedResume = (parsedResume) => {
  const sanitizeArray = (items = []) => {
    const seen = new Set();
    return items
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .filter((item) => {
        const key = item.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 80);
  };

  const sanitized = {
    ...parsedResume,
    skills: sanitizeArray(parsedResume.skills),
    technicalSkills: sanitizeArray(parsedResume.technicalSkills),
    softSkills: sanitizeArray(parsedResume.softSkills),
    jobTitles: sanitizeArray(parsedResume.jobTitles),
    companies: sanitizeArray(parsedResume.companies),
    employmentDates: sanitizeArray(parsedResume.employmentDates),
    languages: sanitizeArray(parsedResume.languages)
  };

  return parsedResumeSchema.parse(sanitized);
};

export const validateParsedResume = (parsedResume) => parsedResumeSchema.parse(parsedResume);

export const parseResumeWithFallback = async (text) => {
  const aiResult = await parseResumeWithAI(text);
  return {
    ...aiResult,
    parsedResume: sanitizeParsedResume(aiResult.parsedResume)
  };
};

export const mergeParsedDataWithCandidate = (candidate, parsedResume) => ({
  fullName: candidate.fullName || parsedResume.fullName,
  email: candidate.email || parsedResume.email,
  phone: candidate.phone || parsedResume.phone,
  location: candidate.location || parsedResume.location,
  totalExperience: candidate.totalExperience || parsedResume.totalExperience,
  linkedinUrl: candidate.linkedinUrl || parsedResume.linkedin,
  githubUrl: candidate.githubUrl || parsedResume.github,
  portfolioUrl: candidate.portfolioUrl || parsedResume.portfolio
});
