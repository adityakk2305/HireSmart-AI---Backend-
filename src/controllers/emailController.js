import { getSafeMailConfig } from "../config/mail.js";
import { EMAIL_TYPES } from "../constants/emailTemplateVariables.js";
import EmailLog from "../models/EmailLog.js";
import Candidate from "../models/Candidate.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  queueCandidateStatusEmail,
  queueFollowUpEmail,
  queueInterviewCancelledEmail,
  queueInterviewInvitation,
  queueInterviewReminder,
  queueInterviewRescheduledEmail
} from "../services/emailAutomationService.js";
import { cancelQueuedEmail, retryEmail, sendTestEmail, verifyEmailConfiguration } from "../services/emailService.js";
import { ensureUserCompany, getOwnedCandidateJob, seedDefaultEmailTemplatesForCompany } from "../services/emailTemplateService.js";

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const logPayload = (log, details = false) => {
  const base = log.toSafeObject ? log.toSafeObject(details) : log;
  return {
  ...base,
  candidateId: log.candidateId?._id?.toString?.() || log.candidateId?.toString?.() || null,
  jobId: log.jobId?._id?.toString?.() || log.jobId?.toString?.() || null,
  interviewId: log.interviewId?._id?.toString?.() || log.interviewId?.toString?.() || null,
  templateId: log.templateId?._id?.toString?.() || log.templateId?.toString?.() || null,
  candidate: log.candidateId?._id
    ? { id: log.candidateId._id.toString(), fullName: log.candidateId.fullName, email: log.candidateId.email, status: log.candidateId.status }
    : null,
  job: log.jobId?._id ? { id: log.jobId._id.toString(), title: log.jobId.title } : null,
  interview: log.interviewId?._id ? { id: log.interviewId._id.toString(), title: log.interviewId.title, status: log.interviewId.status } : null
}; };

const populateLog = (query) =>
  query
    .populate("candidateId", "fullName email status applicationId")
    .populate("jobId", "title department")
    .populate("interviewId", "title status startTime")
    .populate("templateId", "name category slug");

const buildLogFilter = (companyId, query = {}) => {
  const filter = { companyId };
  if (query.status) filter.status = query.status;
  if (query.emailType) filter.emailType = query.emailType;
  if (query.provider) filter.provider = query.provider;
  if (query.candidateId) filter.candidateId = query.candidateId;
  if (query.interviewId) filter.interviewId = query.interviewId;
  if (query.dateFrom || query.dateTo) {
    filter.createdAt = {};
    if (query.dateFrom) filter.createdAt.$gte = new Date(query.dateFrom);
    if (query.dateTo) filter.createdAt.$lte = new Date(query.dateTo);
  }
  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), "i");
    filter.$or = [{ subject: regex }, { "to.email": regex }, { "to.name": regex }, { automationKey: regex }];
  }
  return filter;
};

const sortMap = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  scheduled: { scheduledFor: 1 },
  sent: { sentAt: -1 },
  failed: { failedAt: -1 }
};

export const getEmailSettings = asyncHandler(async (req, res) => {
  const { company } = await ensureUserCompany(req.user.id);
  await seedDefaultEmailTemplatesForCompany(company._id, req.user.id);
  res.status(200).json(new ApiResponse(200, "Email settings fetched", {
    settings: company.toSafeObject().emailSettings,
    providerStatus: getSafeMailConfig()
  }));
});

export const updateEmailSettings = asyncHandler(async (req, res) => {
  const { company } = await ensureUserCompany(req.user.id);
  company.emailSettings = {
    ...company.emailSettings?.toObject?.(),
    ...req.body,
    smtpConfigured: getSafeMailConfig().smtpConfigured
  };
  await company.save();
  res.status(200).json(new ApiResponse(200, "Email settings updated", {
    settings: company.toSafeObject().emailSettings,
    providerStatus: getSafeMailConfig()
  }));
});

export const verifyConfiguration = asyncHandler(async (_req, res) => {
  const data = await verifyEmailConfiguration();
  res.status(200).json(new ApiResponse(200, "Email configuration verified", data));
});

export const sendTestConfigurationEmail = asyncHandler(async (req, res) => {
  const { user, company } = await ensureUserCompany(req.user.id);
  const log = await sendTestEmail({ company, user, to: req.body.to, forceFail: req.body.forceFail });
  res.status(200).json(new ApiResponse(200, "Test email processed", { log: log.toSafeObject(true) }));
});

export const getEmailLogs = asyncHandler(async (req, res) => {
  const { company } = await ensureUserCompany(req.user.id);
  const page = req.query.page;
  const limit = Math.min(req.query.limit, 100);
  const filter = buildLogFilter(company._id, req.query);
  const [logs, total] = await Promise.all([
    populateLog(EmailLog.find(filter).sort(sortMap[req.query.sort] || sortMap.newest).skip((page - 1) * limit).limit(limit)),
    EmailLog.countDocuments(filter)
  ]);
  const pages = Math.ceil(total / limit) || 1;
  res.status(200).json(new ApiResponse(200, "Email logs fetched", {
    logs: logs.map((log) => logPayload(log)),
    pagination: { page, limit, total, pages, hasNextPage: page < pages, hasPreviousPage: page > 1 }
  }));
});

export const getEmailLogById = asyncHandler(async (req, res) => {
  const { company } = await ensureUserCompany(req.user.id);
  const log = await populateLog(EmailLog.findOne({ _id: req.params.id, companyId: company._id }));
  if (!log) throw new ApiError(404, "Email log not found");
  res.status(200).json(new ApiResponse(200, "Email log fetched", { log: logPayload(log, true) }));
});

export const getEmailSummary = asyncHandler(async (req, res) => {
  const { company } = await ensureUserCompany(req.user.id);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [byStatus, byType, sentToday, recentFailed, upcoming] = await Promise.all([
    EmailLog.aggregate([{ $match: { companyId: company._id } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    EmailLog.aggregate([{ $match: { companyId: company._id } }, { $group: { _id: "$emailType", count: { $sum: 1 } } }]),
    EmailLog.countDocuments({ companyId: company._id, status: "Sent", sentAt: { $gte: today } }),
    populateLog(EmailLog.find({ companyId: company._id, status: "Failed" }).sort({ failedAt: -1 }).limit(5)),
    populateLog(EmailLog.find({ companyId: company._id, status: "Pending", scheduledFor: { $gte: new Date() } }).sort({ scheduledFor: 1 }).limit(5))
  ]);
  const statusCounts = Object.fromEntries(byStatus.map((item) => [item._id, item.count]));
  const typeCounts = Object.fromEntries(byType.map((item) => [item._id, item.count]));
  const sent = statusCounts.Sent || 0;
  const failed = statusCounts.Failed || 0;
  res.status(200).json(new ApiResponse(200, "Email summary fetched", {
    sentToday,
    pending: statusCounts.Pending || 0,
    failed,
    sent,
    deliveryRate: sent + failed ? Math.round((sent / (sent + failed)) * 100) : 0,
    interviewInvitations: typeCounts["Interview Invitation"] || 0,
    candidateStatusEmails: ["Shortlisted", "Rejected", "Selected", "On Hold"].reduce((sum, type) => sum + (typeCounts[type] || 0), 0),
    byStatus: statusCounts,
    byType: EMAIL_TYPES.reduce((acc, type) => ({ ...acc, [type]: typeCounts[type] || 0 }), {}),
    recentFailed: recentFailed.map((log) => logPayload(log)),
    upcoming: upcoming.map((log) => logPayload(log)),
    providerStatus: getSafeMailConfig()
  }));
});

export const retryEmailLog = asyncHandler(async (req, res) => {
  const { company } = await ensureUserCompany(req.user.id);
  const log = await retryEmail(req.user.id, company._id, req.params.id);
  res.status(200).json(new ApiResponse(200, "Email retry processed", { log: log.toSafeObject(true) }));
});

export const cancelEmailLog = asyncHandler(async (req, res) => {
  const { company } = await ensureUserCompany(req.user.id);
  const log = await cancelQueuedEmail(company._id, req.params.id);
  res.status(200).json(new ApiResponse(200, "Queued email cancelled", { log: log.toSafeObject() }));
});

export const sendManualCandidateEmail = asyncHandler(async (req, res) => {
  const { company } = await ensureUserCompany(req.user.id);
  const { candidate } = await getOwnedCandidateJob(company._id, req.body.candidateId);
  if (!candidate.email) throw new ApiError(400, "Candidate has no email address");
  const result = await queueFollowUpEmail(req.user.id, req.body.candidateId, {
    templateId: req.body.templateId,
    subject: req.body.subject,
    htmlBody: req.body.htmlBody,
    textBody: req.body.textBody,
    forceFail: req.body.forceFail
  });
  res.status(200).json(new ApiResponse(200, "Candidate email processed", { log: result.log?.toSafeObject(true), duplicate: result.duplicate || false }));
});

export const sendBulkCandidateEmails = asyncHandler(async (req, res) => {
  const { company } = await ensureUserCompany(req.user.id);
  const allowedCount = await Candidate.countDocuments({ _id: { $in: req.body.candidateIds }, companyId: company._id, isDeleted: false });
  if (allowedCount !== req.body.candidateIds.length) throw new ApiError(403, "One or more candidates are unavailable for this company");
  const results = [];
  for (const candidateId of [...new Set(req.body.candidateIds.map(String))]) {
    try {
      const result = await queueFollowUpEmail(req.user.id, candidateId, { templateId: req.body.templateId });
      results.push({ candidateId, success: true, status: result.log?.status, logId: result.log?._id?.toString(), duplicate: result.duplicate || false });
    } catch (error) {
      results.push({ candidateId, success: false, error: error.message || "Email failed" });
    }
  }
  res.status(200).json(new ApiResponse(200, "Bulk email processed", {
    total: results.length,
    successful: results.filter((item) => item.success).length,
    failed: results.filter((item) => !item.success).length,
    results
  }));
});

export const sendCandidateStatusEmail = asyncHandler(async (req, res) => {
  const result = await queueCandidateStatusEmail(req.user.id, req.params.candidateId, req.body.status, { explicit: true, force: req.body.force });
  res.status(200).json(new ApiResponse(200, result.skipped ? "Candidate status email skipped" : "Candidate status email processed", {
    skipped: result.skipped || false,
    reason: result.reason || "",
    duplicate: result.duplicate || false,
    log: result.log?.toSafeObject(true) || null
  }));
});

const sendInterviewResult = async (res, message, result) => {
  res.status(200).json(new ApiResponse(200, result.skipped ? `${message} skipped` : `${message} processed`, {
    skipped: result.skipped || false,
    reason: result.reason || "",
    duplicate: result.duplicate || false,
    log: result.log?.toSafeObject(true) || null
  }));
};

export const sendInterviewInvitation = asyncHandler(async (req, res) =>
  sendInterviewResult(res, "Interview invitation email", await queueInterviewInvitation(req.user.id, req.params.interviewId, { explicit: true, force: req.body.force }))
);

export const sendInterviewReminder = asyncHandler(async (req, res) =>
  sendInterviewResult(res, "Interview reminder email", await queueInterviewReminder(req.user.id, req.params.interviewId, { explicit: true, force: req.body.force }))
);

export const sendInterviewRescheduledEmail = asyncHandler(async (req, res) =>
  sendInterviewResult(res, "Interview reschedule email", await queueInterviewRescheduledEmail(req.user.id, req.params.interviewId, { explicit: true, force: req.body.force }))
);

export const sendInterviewCancelledEmail = asyncHandler(async (req, res) =>
  sendInterviewResult(res, "Interview cancellation email", await queueInterviewCancelledEmail(req.user.id, req.params.interviewId, { explicit: true, force: req.body.force }))
);
