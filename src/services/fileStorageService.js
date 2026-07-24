import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, "../../uploads");
const resumesRoot = path.join(uploadsRoot, "resumes");

export const ensureResumeDirectory = () => {
  fs.mkdirSync(resumesRoot, { recursive: true });
};

export const getResumeRoot = () => resumesRoot;

export const sanitizeOriginalFilename = (filename = "resume") =>
  path
    .basename(filename)
    .replace(/[^\w.\-()\s]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "resume";

export const generateStoredFilename = (originalName = "resume.pdf") => {
  const extension = path.extname(originalName).toLowerCase();
  return `candidate-${crypto.randomUUID()}-${Date.now()}${extension}`;
};

export const getResumeAbsolutePath = (storedName) => path.join(resumesRoot, path.basename(storedName));

export const getResumeAccessPath = (candidateId) => `/api/v1/candidates/${candidateId}/resume`;

export const validateStoredFileExists = async (storedName) => {
  const absolutePath = getResumeAbsolutePath(storedName);
  await fsPromises.access(absolutePath);
  return absolutePath;
};

export const deleteStoredFile = async (storedNameOrPath) => {
  if (!storedNameOrPath) return;

  const absolutePath = path.isAbsolute(storedNameOrPath)
    ? storedNameOrPath
    : getResumeAbsolutePath(storedNameOrPath);

  const resolved = path.resolve(absolutePath);

  if (!resolved.startsWith(resumesRoot)) {
    return;
  }

  try {
    await fsPromises.unlink(resolved);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
};

export const saveResumeMetadata = (file) => ({
  resumeStoragePath: file.filename,
  resumeOriginalName: sanitizeOriginalFilename(file.originalname),
  resumeStoredName: file.filename,
  resumeMimeType: file.mimetype,
  resumeSize: file.size
});
