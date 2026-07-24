import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import multer from "multer";
import ApiError from "../utils/ApiError.js";

const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, "../../uploads/images");

const ensureDirectory = (directory) => {
  fs.mkdirSync(directory, { recursive: true });
};

const storage = (folder) =>
  multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureDirectory(folder);
      cb(null, folder);
    },
    filename: (_req, file, cb) => {
      const extension = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
    }
  });

const fileFilter = (_req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();
  const nameWithoutExtension = path.basename(file.originalname, extension);
  const hasDoubleExtension = /\.[a-z0-9]+$/i.test(nameWithoutExtension);

  if (
    !allowedMimeTypes.includes(file.mimetype) ||
    !allowedExtensions.has(extension) ||
    hasDoubleExtension ||
    file.size === 0
  ) {
    return cb(new ApiError(400, "Invalid image file. Upload JPG, PNG, or WEBP under 2 MB."));
  }

  return cb(null, true);
};

export const companyLogoUpload = multer({
  storage: storage(path.join(uploadsRoot, "companies")),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter
}).single("logo");

export const profileImageUpload = multer({
  storage: storage(path.join(uploadsRoot, "profiles")),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter
}).single("profileImage");

export const handleUploadErrors = (req, res, next) => (error) => {
  if (error) {
    return next(error instanceof ApiError ? error : new ApiError(400, error.message));
  }

  if (!req.file || req.file.size === 0) {
    return next(new ApiError(400, "Image file is required"));
  }

  return next();
};
