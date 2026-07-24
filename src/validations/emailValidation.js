import { z } from "zod";
import { EMAIL_LOG_STATUSES, EMAIL_TEMPLATE_CATEGORIES, EMAIL_TYPES } from "../constants/emailTemplateVariables.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid resource identifier");
const optionalObjectId = objectId.optional().or(z.literal("")).default("");
const optionalEmail = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().toLowerCase().email("Enter a valid email address").optional().default("")
);
const email = z.string().trim().toLowerCase().email("Enter a valid email address");
const bool = z.coerce.boolean().optional().default(false);
const clean = (max = 1000) => z.string().trim().max(max).optional().default("");

export const emailTemplatePayloadSchema = z.object({
  name: z.string().trim().min(2).max(150),
  slug: z.string().trim().max(180).optional().default(""),
  category: z.enum(EMAIL_TEMPLATE_CATEGORIES),
  subject: z.string().trim().min(2).max(300),
  htmlBody: z.string().trim().min(5).max(30000),
  textBody: z.string().trim().max(30000).optional().default(""),
  isActive: z.coerce.boolean().optional().default(true)
}).strict();

export const emailTemplateUpdateSchema = emailTemplatePayloadSchema.partial().strict();

export const emailPreviewSchema = z.object({
  templateId: optionalObjectId,
  subject: clean(300),
  htmlBody: clean(30000),
  textBody: clean(30000)
}).strict().refine((data) => data.templateId || data.subject || data.htmlBody, {
  message: "Template id or preview content is required"
});

export const emailListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  search: clean(120),
  status: z.enum(EMAIL_LOG_STATUSES).optional().or(z.literal("")).default(""),
  emailType: z.enum(EMAIL_TYPES).optional().or(z.literal("")).default(""),
  provider: z.enum(["mock", "smtp"]).optional().or(z.literal("")).default(""),
  candidateId: optionalObjectId,
  interviewId: optionalObjectId,
  dateFrom: clean(80),
  dateTo: clean(80),
  sort: z.enum(["newest", "oldest", "scheduled", "sent", "failed"]).optional().default("newest")
}).strict();

export const templateListQuerySchema = z.object({
  search: clean(120),
  category: z.enum(EMAIL_TEMPLATE_CATEGORIES).optional().or(z.literal("")).default(""),
  isActive: z.enum(["true", "false"]).optional().or(z.literal("")).default("")
}).strict();

export const idParamsSchema = z.object({ id: objectId }).strict();
export const emailLogIdParamsSchema = z.object({ id: objectId }).strict();
export const candidateEmailParamsSchema = z.object({ candidateId: objectId }).strict();
export const interviewEmailParamsSchema = z.object({ interviewId: objectId }).strict();

export const sendTestEmailSchema = z.object({
  to: email,
  forceFail: bool
}).strict();

export const manualCandidateEmailSchema = z.object({
  candidateId: objectId,
  templateId: optionalObjectId,
  subject: clean(300),
  htmlBody: clean(30000),
  textBody: clean(30000),
  emailType: z.enum(["Manual", "Follow Up", "Custom"]).optional().default("Manual"),
  forceFail: bool
}).strict().refine((data) => data.templateId || data.subject || data.htmlBody || data.textBody, {
  message: "Select a template or enter a message"
});

export const bulkCandidateEmailSchema = z.object({
  candidateIds: z.array(objectId).min(1).max(50),
  templateId: objectId,
  emailType: z.enum(["Manual", "Follow Up", "Custom"]).optional().default("Manual")
}).strict();

export const automationSendSchema = z.object({
  force: bool
}).strict();

export const candidateStatusEmailSchema = z.object({
  status: z.enum(["Shortlisted", "Rejected", "Selected", "On Hold"]).optional(),
  force: bool
}).strict();

export const emailSettingsSchema = z.object({
  senderName: z.string().trim().min(2).max(120),
  senderEmail: email,
  replyToEmail: optionalEmail,
  provider: z.enum(["mock", "smtp"]),
  emailAutomationEnabled: z.coerce.boolean(),
  interviewInvitationsEnabled: z.coerce.boolean(),
  interviewRemindersEnabled: z.coerce.boolean(),
  candidateStatusEmailsEnabled: z.coerce.boolean(),
  defaultReminderHours: z.coerce.number().int().min(1).max(168),
  footerText: clean(1000)
}).strict();
