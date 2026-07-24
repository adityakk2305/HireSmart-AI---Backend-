import path from "path";
import multer from "multer";
import ApiError from "../utils/ApiError.js";
import {
  ensureResumeDirectory,
  generateStoredFilename,
  getResumeRoot,
  sanitizeOriginalFilename
} from "../services/fileStorageService.js";

const allowedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);
const allowedExtensions = new Set([".pdf", ".docx"]);
const maxResumeSize = 5 * 1024 * 1024;

const virusScanPlaceholder = (_file) => true;

const hasSuspiciousName = (originalName = "") => {
  const base = path.basename(originalName);
  const extension = path.extname(base).toLowerCase();
  const nameWithoutExtension = path.basename(base, extension);
  const extensionMatches = base.match(/\.[a-z0-9]+/gi) || [];

  return (
    !base ||
    base !== originalName ||
    originalName.includes("..") ||
    /[\\/]/.test(originalName) ||
    !allowedExtensions.has(extension) ||
    extensionMatches.length > 1 ||
    /\.[a-z0-9]+$/i.test(nameWithoutExtension)
  );
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureResumeDirectory();
    cb(null, getResumeRoot());
  },
  filename: (_req, file, cb) => {
    cb(null, generateStoredFilename(file.originalname));
  }
});

const fileFilter = (_req, file, cb) => {
  const originalName = sanitizeOriginalFilename(file.originalname);
  const extension = path.extname(originalName).toLowerCase();

  if (
    hasSuspiciousName(file.originalname) ||
    !allowedExtensions.has(extension) ||
    !allowedMimeTypes.has(file.mimetype)
  ) {
    return cb(new ApiError(400, "Invalid resume file. Upload a PDF or DOCX file under 5 MB."));
  }

  return cb(null, true);
};

export const resumeUpload = multer({
  storage,
  limits: { fileSize: maxResumeSize, files: 1 },
  fileFilter
}).single("resume");

export const handleResumeUploadErrors = (req, _res, next) => (error) => {
  if (error) {
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Resume must be 5 MB or smaller"
      : error.message;
    return next(error instanceof ApiError ? error : new ApiError(400, message));
  }

  if (!req.file || req.file.size <= 0) {
    return next(new ApiError(400, "Resume file is required"));
  }

  if (!virusScanPlaceholder(req.file)) {
    return next(new ApiError(400, "Resume file failed security scanning"));
  }

  return next();
};
