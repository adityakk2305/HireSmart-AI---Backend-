import { z } from "zod";
import { AI_SCREENING_STATUSES, CANDIDATE_SOURCES, CANDIDATE_STATUSES, RESUME_PARSE_STATUSES } from "../models/Candidate.js";

const protectedFields = [
  "companyId",
  "jobId",
  "applicationId",
  "status",
  "statusHistory",
  "aiEvaluation",
  "parsedResume",
  "extractedResumeText",
  "recruiterNotes",
  "createdBy",
  "resumeStoragePath",
  "resumeStoredName"
];

const emptyToUndefined = (value) => (value === "" || value === null ? undefined : value);

const numberFromInput = (schema) =>
  z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) return undefined;
    return Number(value);
  }, schema);

const optionalUrl = z.preprocess(
  emptyToUndefined,
  z.string().trim().url("Enter a valid URL").max(300).optional()
);

const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return value;
  }
};

export const screeningAnswerInputSchema = z.object({
  questionId: z.string().trim().min(1).max(120),
  answer: z.union([z.string(), z.number(), z.boolean()]).optional()
});

const baseCandidateFields = {
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(3).max(30),
  location: z.string().trim().max(150).optional().default(""),
  totalExperience: numberFromInput(z.number().min(0).max(60).default(0)),
  currentCompany: z.string().trim().max(150).optional().default(""),
  currentDesignation: z.string().trim().max(150).optional().default(""),
  expectedSalary: numberFromInput(z.number().min(0).optional().nullable()),
  noticePeriod: z.string().trim().max(100).optional().default(""),
  linkedinUrl: optionalUrl.default(""),
  githubUrl: optionalUrl.default(""),
  portfolioUrl: optionalUrl.default(""),
  coverLetter: z.string().trim().max(5000).optional().default(""),
  screeningAnswers: z.preprocess(parseJsonArray, z.array(screeningAnswerInputSchema).default([]))
};

const rejectProtectedFields = (data, ctx) => {
  protectedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      ctx.addIssue({ code: "custom", path: [field], message: `${field} cannot be submitted` });
    }
  });
};

export const publicApplicationSchema = z
  .object(baseCandidateFields)
  .strict()
  .superRefine(rejectProtectedFields);

export const hrCandidateUploadSchema = z
  .object({
    ...baseCandidateFields,
    source: z.enum(["HR Upload", "Referral", "Other"]).optional().default("HR Upload")
  })
  .strict();

export const candidateUpdateSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
    phone: z.string().trim().min(3).max(30).optional(),
    location: z.string().trim().max(150).optional(),
    totalExperience: numberFromInput(z.number().min(0).max(60)).optional(),
    currentCompany: z.string().trim().max(150).optional(),
    currentDesignation: z.string().trim().max(150).optional(),
    expectedSalary: numberFromInput(z.number().min(0).optional().nullable()),
    noticePeriod: z.string().trim().max(100).optional(),
    linkedinUrl: optionalUrl,
    githubUrl: optionalUrl,
    portfolioUrl: optionalUrl,
    coverLetter: z.string().trim().max(5000).optional(),
    source: z.enum(CANDIDATE_SOURCES).optional()
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, "At least one field is required");

export const candidateStatusUpdateSchema = z.object({
  status: z.enum(CANDIDATE_STATUSES),
  note: z.string().trim().max(1000).optional().default(""),
  sendEmail: z.coerce.boolean().optional().default(false),
  forceEmail: z.coerce.boolean().optional().default(false)
});

export const candidateListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  search: z.string().trim().optional().default(""),
  jobId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  status: z.enum(CANDIDATE_STATUSES).optional(),
  source: z.enum(CANDIDATE_SOURCES).optional(),
  resumeParseStatus: z.enum(RESUME_PARSE_STATUSES).optional(),
  aiScreeningStatus: z.enum(AI_SCREENING_STATUSES).optional(),
  category: z.enum(["Excellent Match", "Good Match", "Average Match", "Low Match", "Not Suitable"]).optional(),
  scoreMin: z.coerce.number().min(0).max(100).optional(),
  scoreMax: z.coerce.number().min(0).max(100).optional(),
  requiredSkill: z.string().trim().max(120).optional(),
  missingSkill: z.string().trim().max(120).optional(),
  noticePeriod: z.string().trim().max(100).optional(),
  hasResume: z.coerce.boolean().optional(),
  hasParsedResume: z.coerce.boolean().optional(),
  hasAiEvaluation: z.coerce.boolean().optional(),
  experienceMin: z.coerce.number().min(0).optional(),
  experienceMax: z.coerce.number().min(0).optional(),
  appliedFrom: z.coerce.date().optional(),
  appliedTo: z.coerce.date().optional(),
  sort: z
    .enum([
      "newest",
      "oldest",
      "name-asc",
      "name-desc",
      "experience-asc",
      "experience-desc",
      "status",
      "application-id",
      "score-desc",
      "score-asc",
      "category",
      "screened-newest",
      "screened-oldest",
      "recently-screened",
      "oldest-screening",
      "job-title",
      "last-updated"
    ])
    .optional()
    .default("newest")
});

export const bulkAiScreeningSchema = z.object({
  candidateIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid candidate id")).min(1).max(20),
  force: z.boolean().optional().default(false)
});

export const recruiterNoteSchema = z.object({
  text: z.string().trim().min(1, "Note text is required").max(3000)
}).strict();

export const candidateNoteParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid candidate id"),
  noteId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid note id")
});

export const bulkCandidateActionSchema = z.object({
  candidateIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid candidate id")).min(1).max(50),
  action: z.enum(["change-status", "soft-delete", "export"]),
  status: z.enum(CANDIDATE_STATUSES).optional(),
  note: z.string().trim().max(1000).optional().default(""),
  deletionReason: z.string().trim().max(1000).optional().default("")
}).strict().superRefine((data, ctx) => {
  if (data.action === "change-status" && !data.status) {
    ctx.addIssue({ code: "custom", path: ["status"], message: "Status is required for change-status" });
  }
});

export const compareCandidatesSchema = z.object({
  candidateIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid candidate id")).min(2).max(4)
}).strict();

const parseCandidateIds = (value) => {
  if (!value) return undefined;
  if (Array.isArray(value)) return value;
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
};

export const candidateExportQuerySchema = candidateListQuerySchema.extend({
  candidateIds: z.preprocess(
    parseCandidateIds,
    z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid candidate id")).max(5000).optional()
  )
});

export const candidateIdParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid candidate id")
});

export const candidateJobParamsSchema = z.object({
  jobId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid job id")
});

export const candidateApplyParamsSchema = z.object({
  jobSlug: z.string().trim().min(2).max(180)
});

export const candidateStatusLookupSchema = z.object({
  applicationId: z.string().trim().min(6).max(40),
  email: z.string().trim().toLowerCase().email()
});

export const parseResumeQuerySchema = z.object({
  force: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((value) => value === "true")
});
