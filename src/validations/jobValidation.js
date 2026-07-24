import { z } from "zod";

export const JOB_STATUSES = ["Draft", "Active", "Closed", "Archived"];

const protectedFields = [
  "companyId",
  "createdBy",
  "publicApplicationSlug",
  "candidateCount",
  "publishedAt",
  "closedAt",
  "archivedAt"
];

const numberFromInput = (schema) =>
  z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) return undefined;
    return Number(value);
  }, schema);

const optionalNumberFromInput = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  return Number(value);
}, z.number().min(0).optional().nullable());

const skillArray = (required = false) =>
  z
    .array(z.string().trim().min(1).max(60))
    .max(30)
    .transform((items) => {
      const seen = new Set();
      return items.filter((item) => {
        const key = item.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })
    .refine((items) => !required || items.length > 0, "At least one skill is required");

const responsibilitiesSchema = z
  .array(z.string().trim().min(1).max(500))
  .min(1, "At least one responsibility is required")
  .max(30);

const screeningQuestionSchema = z
  .object({
    key: z.string().optional(),
    question: z.string().trim().min(1, "Question is required").max(500),
    type: z.enum(["text", "textarea", "number", "select", "yes-no"]).default("text"),
    required: z.boolean().optional().default(false),
    options: z.array(z.string().trim()).optional().default([]),
    order: z.number().optional()
  })
  .transform((question) => ({
    ...question,
    key: question.key || `question-${Date.now()}`,
    options:
      question.type === "select"
        ? Array.from(new Set(question.options.filter(Boolean)))
        : [],
    order: question.order ?? 0
  }))
  .refine((question) => question.type !== "select" || question.options.length >= 2, {
    message: "Select questions require at least two options",
    path: ["options"]
  });

const validateJobRules = (data, ctx, { partial = false } = {}) => {
  protectedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      ctx.addIssue({ code: "custom", path: [field], message: `${field} cannot be set manually` });
    }
  });

  if (!partial && data.workMode !== "Remote" && !data.location?.trim()) {
    ctx.addIssue({ code: "custom", path: ["location"], message: "Location is required unless work mode is Remote" });
  }

  if (partial && data.workMode && data.workMode !== "Remote" && "location" in data && !data.location?.trim()) {
    ctx.addIssue({ code: "custom", path: ["location"], message: "Location is required unless work mode is Remote" });
  }

  if (
    data.minimumExperience !== undefined &&
    data.maximumExperience !== undefined &&
    data.maximumExperience < data.minimumExperience
  ) {
    ctx.addIssue({ code: "custom", path: ["maximumExperience"], message: "Maximum experience must be greater than or equal to minimum experience" });
  }

  if (data.salaryMin !== undefined && data.salaryMax !== undefined && data.salaryMax !== null && data.salaryMin !== null && data.salaryMax < data.salaryMin) {
    ctx.addIssue({ code: "custom", path: ["salaryMax"], message: "Maximum salary must be greater than or equal to minimum salary" });
  }

  if (data.status === "Active" && data.deadline !== undefined && data.deadline < new Date()) {
    ctx.addIssue({ code: "custom", path: ["deadline"], message: "Active jobs cannot have a past deadline" });
  }
};

const baseJobObjectSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    department: z.string().trim().min(1).max(100),
    employmentType: z.enum(["Full-time", "Part-time", "Contract", "Internship", "Temporary"]),
    workMode: z.enum(["On-site", "Remote", "Hybrid"]),
    location: z.string().trim().max(150).optional().default(""),
    minimumExperience: numberFromInput(z.number().min(0).default(0)),
    maximumExperience: numberFromInput(z.number().min(0).default(0)),
    requiredSkills: skillArray(true),
    preferredSkills: skillArray(false).optional().default([]),
    education: z.string().trim().min(1).max(300),
    description: z.string().trim().min(50).max(10000),
    responsibilities: responsibilitiesSchema,
    salaryMin: optionalNumberFromInput,
    salaryMax: optionalNumberFromInput,
    salaryCurrency: z.enum(["INR", "USD", "EUR", "GBP", "AED", "Other"]).default("INR"),
    salaryPeriod: z.enum(["Yearly", "Monthly", "Hourly", "Project-based"]).default("Yearly"),
    openings: numberFromInput(z.number().int().min(1).max(1000)),
    deadline: z.coerce.date(),
    status: z.enum(JOB_STATUSES).optional().default("Draft"),
    screeningQuestions: z.array(screeningQuestionSchema).max(20).optional().default([])
  })
  .strict();

export const createJobSchema = baseJobObjectSchema.superRefine((data, ctx) => validateJobRules(data, ctx));

const updateJobObjectSchema = z
  .object({
    title: z.string().trim().min(2).max(120).optional(),
    department: z.string().trim().min(1).max(100).optional(),
    employmentType: z.enum(["Full-time", "Part-time", "Contract", "Internship", "Temporary"]).optional(),
    workMode: z.enum(["On-site", "Remote", "Hybrid"]).optional(),
    location: z.string().trim().max(150).optional(),
    minimumExperience: numberFromInput(z.number().min(0)).optional(),
    maximumExperience: numberFromInput(z.number().min(0)).optional(),
    requiredSkills: skillArray(true).optional(),
    preferredSkills: skillArray(false).optional(),
    education: z.string().trim().min(1).max(300).optional(),
    description: z.string().trim().min(50).max(10000).optional(),
    responsibilities: responsibilitiesSchema.optional(),
    salaryMin: optionalNumberFromInput,
    salaryMax: optionalNumberFromInput,
    salaryCurrency: z.enum(["INR", "USD", "EUR", "GBP", "AED", "Other"]).optional(),
    salaryPeriod: z.enum(["Yearly", "Monthly", "Hourly", "Project-based"]).optional(),
    openings: numberFromInput(z.number().int().min(1).max(1000)).optional(),
    deadline: z.coerce.date().optional(),
    status: z.enum(JOB_STATUSES).optional(),
    screeningQuestions: z.array(screeningQuestionSchema).max(20).optional()
  })
  .strict()
  .superRefine((data, ctx) => validateJobRules(data, ctx, { partial: true }))
  .refine((data) => Object.keys(data).length > 0, "At least one editable field is required");

export const updateJobSchema = updateJobObjectSchema;

export const changeJobStatusSchema = z.object({
  status: z.enum(JOB_STATUSES)
});

export const jobIdParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid job id")
});

export const publicSlugParamsSchema = z.object({
  slug: z.string().trim().min(2).max(180)
});

export const jobListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  search: z.string().trim().optional().default(""),
  status: z.enum(JOB_STATUSES).optional(),
  department: z.string().trim().optional(),
  employmentType: z.enum(["Full-time", "Part-time", "Contract", "Internship", "Temporary"]).optional(),
  workMode: z.enum(["On-site", "Remote", "Hybrid"]).optional(),
  location: z.string().trim().optional(),
  sort: z
    .enum(["newest", "oldest", "deadline-asc", "deadline-desc", "title-asc", "title-desc", "openings-desc"])
    .optional()
    .default("newest"),
  deadlineFrom: z.coerce.date().optional(),
  deadlineTo: z.coerce.date().optional()
});
