import { z } from "zod";
import { INTERVIEW_MODES, INTERVIEW_RECOMMENDATIONS, INTERVIEW_ROUNDS, INTERVIEW_TYPES, QUESTION_CATEGORIES, QUESTION_DIFFICULTIES } from "../models/Interview.js";
import { INTERVIEW_STATUSES } from "../constants/interviewStatusTransitions.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid resource identifier");
const optionalObjectId = objectId.optional();
const isoDateTime = z.string().datetime({ offset: true, message: "Enter a valid ISO date-time with timezone offset" });
const timezone = z.string().trim().min(1).max(80).refine((value) => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "Enter a valid IANA timezone");
const duration = z.coerce.number().int().min(10).max(240);
const cleanString = (max = 1000) => z.string().trim().max(max).optional().default("");
const questionCategory = z.enum(QUESTION_CATEGORIES);
const questionDifficulty = z.enum(QUESTION_DIFFICULTIES);

const interviewerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().toLowerCase(),
  role: z.string().trim().max(120).optional().default("Interviewer")
}).strict();

const baseInterviewSchema = z.object({
  candidateId: objectId,
  jobId: objectId,
  interviewRound: z.enum(INTERVIEW_ROUNDS),
  customRoundLabel: z.string().trim().max(120).optional().default(""),
  title: z.string().trim().min(2).max(200),
  interviewType: z.enum(INTERVIEW_TYPES),
  interviewMode: z.enum(INTERVIEW_MODES),
  startTime: isoDateTime,
  durationMinutes: duration,
  timezone,
  interviewerIds: z.array(objectId).max(12).optional().default([]),
  interviewers: z.array(interviewerSchema).max(12).optional().default([]),
  meetingLink: z.string().trim().url("Meeting link must be a valid URL").max(1000).optional().or(z.literal("")).default(""),
  location: z.string().trim().max(500).optional().default(""),
  instructions: cleanString(3000),
  agenda: cleanString(3000),
  privateNotes: cleanString(5000),
  overrideDuplicateRound: z.coerce.boolean().optional().default(false),
  overrideReason: cleanString(1000)
}).strict().superRefine((data, ctx) => {
  if (data.interviewRound === "Custom" && !data.customRoundLabel) {
    ctx.addIssue({ code: "custom", path: ["customRoundLabel"], message: "Custom round label is required" });
  }
  if (data.interviewMode === "Video" && !data.meetingLink) {
    ctx.addIssue({ code: "custom", path: ["meetingLink"], message: "Meeting link is required for video interviews" });
  }
  if (data.meetingLink && !data.meetingLink.startsWith("https://")) {
    ctx.addIssue({ code: "custom", path: ["meetingLink"], message: "Meeting link must use HTTPS" });
  }
  if (data.interviewMode === "In Person" && !data.location) {
    ctx.addIssue({ code: "custom", path: ["location"], message: "Location is required for in-person interviews" });
  }
  if (!data.interviewerIds.length && !data.interviewers.length) {
    ctx.addIssue({ code: "custom", path: ["interviewerIds"], message: "Add at least one interviewer" });
  }
});

export const createInterviewSchema = baseInterviewSchema;
export const updateInterviewSchema = z.object({
  candidateId: objectId.optional(),
  jobId: objectId.optional(),
  interviewRound: z.enum(INTERVIEW_ROUNDS).optional(),
  customRoundLabel: z.string().trim().max(120).optional(),
  title: z.string().trim().min(2).max(200).optional(),
  interviewType: z.enum(INTERVIEW_TYPES).optional(),
  interviewMode: z.enum(INTERVIEW_MODES).optional(),
  startTime: isoDateTime.optional(),
  durationMinutes: duration.optional(),
  timezone: timezone.optional(),
  interviewerIds: z.array(objectId).max(12).optional(),
  interviewers: z.array(interviewerSchema).max(12).optional(),
  meetingLink: z.string().trim().url("Meeting link must be a valid URL").max(1000).optional().or(z.literal("")),
  location: z.string().trim().max(500).optional(),
  instructions: cleanString(3000),
  agenda: cleanString(3000),
  privateNotes: cleanString(5000),
  overrideDuplicateRound: z.coerce.boolean().optional().default(false),
  overrideReason: cleanString(1000)
}).strict().superRefine((data, ctx) => {
  if (data.interviewRound === "Custom" && !data.customRoundLabel) {
    ctx.addIssue({ code: "custom", path: ["customRoundLabel"], message: "Custom round label is required" });
  }
  if (data.interviewMode === "Video" && !data.meetingLink) {
    ctx.addIssue({ code: "custom", path: ["meetingLink"], message: "Meeting link is required for video interviews" });
  }
  if (data.meetingLink && !data.meetingLink.startsWith("https://")) {
    ctx.addIssue({ code: "custom", path: ["meetingLink"], message: "Meeting link must use HTTPS" });
  }
  if (data.interviewMode === "In Person" && !data.location) {
    ctx.addIssue({ code: "custom", path: ["location"], message: "Location is required for in-person interviews" });
  }
});

export const rescheduleInterviewSchema = z.object({
  startTime: isoDateTime,
  durationMinutes: duration,
  timezone,
  reason: z.string().trim().min(2).max(1000)
}).strict();

export const cancelInterviewSchema = z.object({
  reason: z.string().trim().min(2).max(1000)
}).strict();

export const interviewStatusUpdateSchema = z.object({
  status: z.enum(INTERVIEW_STATUSES)
}).strict();

const rating = z.coerce.number().min(1).max(5).optional().nullable();
export const feedbackSchema = z.object({
  technicalRating: rating,
  communicationRating: rating,
  problemSolvingRating: rating,
  cultureFitRating: rating,
  overallRating: z.coerce.number().min(1).max(5),
  strengths: z.array(z.string().trim().min(1).max(500)).max(20).optional().default([]),
  concerns: z.array(z.string().trim().min(1).max(500)).max(20).optional().default([]),
  notes: cleanString(5000),
  recommendation: z.enum(INTERVIEW_RECOMMENDATIONS.filter((item) => item !== "Mixed"))
}).strict();

export const generateQuestionsSchema = z.object({
  count: z.coerce.number().int().min(1).max(20).optional().default(8),
  difficulty: questionDifficulty.optional().default("Medium"),
  categories: z.array(questionCategory).max(8).optional().default([])
}).strict();

export const interviewListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  search: z.string().trim().max(120).optional().default(""),
  jobId: optionalObjectId,
  candidateId: optionalObjectId,
  status: z.enum(INTERVIEW_STATUSES).optional().or(z.literal("")).default(""),
  interviewType: z.enum(INTERVIEW_TYPES).optional().or(z.literal("")).default(""),
  interviewMode: z.enum(INTERVIEW_MODES).optional().or(z.literal("")).default(""),
  interviewerId: optionalObjectId.or(z.literal("")).default(""),
  dateFrom: z.string().optional().default(""),
  dateTo: z.string().optional().default(""),
  upcomingOnly: z.coerce.boolean().optional().default(false),
  todayOnly: z.coerce.boolean().optional().default(false),
  overdueOnly: z.coerce.boolean().optional().default(false),
  sort: z.enum(["soonest", "latest", "newest-created", "oldest-created", "candidate-name", "status", "recently-updated"]).optional().default("soonest"),
  timezone: z.string().trim().max(80).optional().default("Asia/Kolkata")
}).strict();

export const interviewIdParamsSchema = z.object({ id: objectId }).strict();
export const feedbackParamsSchema = z.object({ id: objectId, feedbackId: objectId }).strict();
export const candidateInterviewParamsSchema = z.object({ candidateId: objectId }).strict();
