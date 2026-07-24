import env from "../config/env.js";
import { APPROVED_EMAIL_VARIABLES, DEFAULT_EMAIL_TEMPLATES } from "../constants/emailTemplateVariables.js";
import Candidate from "../models/Candidate.js";
import Company from "../models/Company.js";
import EmailTemplate from "../models/EmailTemplate.js";
import Interview from "../models/Interview.js";
import Job from "../models/Job.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";

const variablePattern = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const slugifyTemplate = (value = "") =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160) || `template-${Date.now()}`;

export const extractTemplateVariables = (content = "") => {
  const variables = new Set();
  for (const match of String(content).matchAll(variablePattern)) {
    variables.add(match[1]);
  }
  return [...variables];
};

export const validateTemplateVariables = (...contents) => {
  const used = [...new Set(contents.flatMap((content) => extractTemplateVariables(content)))];
  const unsupported = used.filter((item) => !APPROVED_EMAIL_VARIABLES.includes(item));

  if (unsupported.length) {
    throw new ApiError(400, `Unsupported template variable${unsupported.length > 1 ? "s" : ""}: ${unsupported.join(", ")}`);
  }

  return used;
};

export const findMissingTemplateVariables = (contents = [], context = {}) => {
  const used = [...new Set(contents.flatMap((content) => extractTemplateVariables(content)))];
  return used.filter((item) => !Object.prototype.hasOwnProperty.call(context, item));
};

export const sanitizeTemplateHtml = (html = "") => {
  const source = String(html);
  if (/<script|<iframe|<object|<embed|javascript:|\son[a-z]+\s*=/i.test(source)) {
    throw new ApiError(400, "Email template contains unsafe HTML");
  }

  const sanitized = source
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?>[\s\S]*?<\/embed>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "");

  if (/<script|<iframe|javascript:|onerror=|onclick=/i.test(sanitized)) {
    throw new ApiError(400, "Email template contains unsafe HTML");
  }

  return sanitized;
};

export const generateTextFallback = (html = "") =>
  sanitizeTemplateHtml(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const replaceApprovedVariables = (content = "", context = {}, { html = false } = {}) =>
  String(content).replace(variablePattern, (_match, key) => {
    if (!APPROVED_EMAIL_VARIABLES.includes(key)) {
      throw new ApiError(400, `Unsupported template variable: ${key}`);
    }
    const value = context[key] ?? "";
    return html ? escapeHtml(value) : String(value);
  });

export const renderEmailTemplate = ({ subject, htmlBody, textBody, context }) => {
  validateTemplateVariables(subject, htmlBody, textBody || "");
  const missing = findMissingTemplateVariables([subject, htmlBody, textBody || ""], context);

  if (missing.length) {
    throw new ApiError(400, `Missing template variable value${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`);
  }

  const safeHtml = sanitizeTemplateHtml(htmlBody);
  const safeText = textBody?.trim() ? textBody : generateTextFallback(safeHtml);

  return {
    subject: replaceApprovedVariables(subject, context),
    htmlBody: replaceApprovedVariables(safeHtml, context, { html: true }),
    textBody: replaceApprovedVariables(safeText, context),
    usedVariables: validateTemplateVariables(subject, htmlBody, safeText)
  };
};

export const sampleEmailContext = () => ({
  candidateName: "Linus Torvalds",
  candidateFirstName: "Linus",
  candidateEmail: "linus.phase10@example.com",
  applicationId: "HSA-2026-DEMO10",
  candidateStatus: "Shortlisted",
  jobTitle: "MERN Stack Developer",
  department: "Engineering",
  jobLocation: "Bengaluru, India",
  employmentType: "Full-time",
  workMode: "Hybrid",
  companyName: "HireSmart Demo Pvt Ltd",
  companyWebsite: "https://hiresmart.example.com",
  companyAddress: "Bengaluru, Karnataka, India",
  senderName: "HireSmart HR",
  replyToEmail: "hr@hiresmart.com",
  interviewTitle: "Technical Round 1",
  interviewRound: "Technical Round 1",
  interviewType: "Technical",
  interviewMode: "Video",
  interviewDate: new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(Date.now() + 86400000)),
  interviewStartTime: "10:00 AM",
  interviewEndTime: "10:45 AM",
  interviewDuration: "45 minutes",
  interviewTimezone: "Asia/Kolkata",
  meetingLink: "https://meet.google.com/demo-phase-ten",
  interviewLocation: "",
  interviewerNames: "HireSmart HR",
  interviewInstructions: "Please join five minutes early and keep your resume handy.",
  interviewAgenda: "Role fit, MERN experience, and project discussion.",
  frontendUrl: env.frontendUrl,
  applicationStatusUrl: `${env.frontendUrl}/application-status`
});

const formatTime = (date, timezone) =>
  date
    ? new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: timezone || "Asia/Kolkata" }).format(new Date(date))
    : "";

const formatDate = (date, timezone) =>
  date
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: timezone || "Asia/Kolkata" }).format(new Date(date))
    : "";

export const buildTemplateContext = ({ company, candidate = null, job = null, interview = null, user = null }) => {
  const settings = company?.emailSettings || {};
  const firstName = candidate?.fullName?.split(" ")?.[0] || candidate?.fullName || "Candidate";
  const timezone = interview?.timezone || "Asia/Kolkata";
  const address = [company?.address, company?.city, company?.state, company?.country].filter(Boolean).join(", ");
  const statusUrl = candidate
    ? `${env.frontendUrl}/application-status?applicationId=${encodeURIComponent(candidate.applicationId)}&email=${encodeURIComponent(candidate.email)}`
    : `${env.frontendUrl}/application-status`;

  return {
    candidateName: candidate?.fullName || "Candidate",
    candidateFirstName: firstName,
    candidateEmail: candidate?.email || "",
    applicationId: candidate?.applicationId || "",
    candidateStatus: candidate?.status || "",
    jobTitle: job?.title || "",
    department: job?.department || "",
    jobLocation: job?.location || "",
    employmentType: job?.employmentType || "",
    workMode: job?.workMode || "",
    companyName: company?.name || "HireSmart AI",
    companyWebsite: company?.website || "",
    companyAddress: address,
    senderName: settings.senderName || user?.name || "HireSmart AI",
    replyToEmail: settings.replyToEmail || settings.senderEmail || company?.contactEmail || "",
    interviewTitle: interview?.title || "",
    interviewRound: interview?.interviewRound === "Custom" ? interview.customRoundLabel : interview?.interviewRound || "",
    interviewType: interview?.interviewType || "",
    interviewMode: interview?.interviewMode || "",
    interviewDate: formatDate(interview?.startTime, timezone),
    interviewStartTime: formatTime(interview?.startTime, timezone),
    interviewEndTime: formatTime(interview?.endTime, timezone),
    interviewDuration: interview?.durationMinutes ? `${interview.durationMinutes} minutes` : "",
    interviewTimezone: timezone,
    meetingLink: interview?.meetingLink || "",
    interviewLocation: interview?.location || "",
    interviewerNames: (interview?.interviewers || []).map((item) => item.name).filter(Boolean).join(", "),
    interviewInstructions: interview?.instructions || "",
    interviewAgenda: interview?.agenda || "",
    frontendUrl: env.frontendUrl,
    applicationStatusUrl: statusUrl
  };
};

export const previewTemplate = ({ template = null, payload = {}, context = null }) => {
  const data = {
    subject: payload.subject?.trim() || template?.subject || "",
    htmlBody: payload.htmlBody?.trim() || template?.htmlBody || "",
    textBody: payload.textBody?.trim() || template?.textBody || ""
  };
  const usedContext = context || sampleEmailContext();
  const rendered = renderEmailTemplate({ ...data, context: usedContext });
  const missingVariables = findMissingTemplateVariables([data.subject, data.htmlBody, data.textBody], usedContext);

  return {
    ...rendered,
    missingVariables,
    invalidVariables: []
  };
};

export const getDefaultTemplateForCategory = (category) =>
  DEFAULT_EMAIL_TEMPLATES.find((template) => template.category === category);

export const seedDefaultEmailTemplatesForCompany = async (companyId, userId) => {
  const created = [];

  for (const template of DEFAULT_EMAIL_TEMPLATES) {
    const existing = await EmailTemplate.findOne({ companyId, slug: template.slug });
    const safeHtml = sanitizeTemplateHtml(template.htmlBody);
    const textBody = template.textBody || generateTextFallback(safeHtml);
    const variables = validateTemplateVariables(template.subject, safeHtml, textBody);

    if (existing) {
      if (existing.isDefault) {
        existing.set({
          ...template,
          htmlBody: safeHtml,
          textBody,
          availableVariables: variables,
          isDefault: true,
          isActive: true,
          updatedBy: userId
        });
        await existing.save();
      }
      continue;
    }

    created.push(
      await EmailTemplate.create({
        ...template,
        companyId,
        htmlBody: safeHtml,
        textBody,
        availableVariables: variables,
        isDefault: true,
        isActive: true,
        createdBy: userId,
        updatedBy: userId
      })
    );
  }

  return created;
};

export const ensureUserCompany = async (userId) => {
  const user = await User.findById(userId);
  if (!user || user.role !== "hr") throw new ApiError(403, "Only HR users can manage email automation");
  if (!user.companyId) throw new ApiError(403, "Company onboarding is required before email automation");
  const company = await Company.findOne({ _id: user.companyId, isActive: true });
  if (!company) throw new ApiError(404, "Company not found");
  return { user, company };
};

export const getOwnedTemplate = async (companyId, templateId) => {
  const template = await EmailTemplate.findOne({ _id: templateId, companyId });
  if (!template) throw new ApiError(404, "Email template not found");
  return template;
};

export const getOwnedCandidateJob = async (companyId, candidateId) => {
  const candidate = await Candidate.findOne({ _id: candidateId, companyId, isDeleted: false });
  if (!candidate) throw new ApiError(404, "Candidate not found");
  const job = await Job.findOne({ _id: candidate.jobId, companyId });
  if (!job) throw new ApiError(404, "Job not found");
  return { candidate, job };
};

export const getOwnedInterviewBundle = async (companyId, interviewId) => {
  const interview = await Interview.findOne({ _id: interviewId, companyId });
  if (!interview) throw new ApiError(404, "Interview not found");
  const [candidate, job] = await Promise.all([
    Candidate.findOne({ _id: interview.candidateId, companyId, isDeleted: false }),
    Job.findOne({ _id: interview.jobId, companyId })
  ]);
  if (!candidate) throw new ApiError(404, "Candidate not found");
  if (!job) throw new ApiError(404, "Job not found");
  return { interview, candidate, job };
};
