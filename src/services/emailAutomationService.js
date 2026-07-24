import env from "../config/env.js";
import { ACTIVE_INTERVIEW_STATUSES } from "../constants/interviewStatusTransitions.js";
import Candidate from "../models/Candidate.js";
import Interview from "../models/Interview.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import { generateIdempotencyKey, sendTemplateEmail } from "./emailService.js";
import { ensureUserCompany, getOwnedCandidateJob, getOwnedInterviewBundle } from "./emailTemplateService.js";

const settingsEnabled = (company, key) =>
  Boolean((company.emailSettings?.emailAutomationEnabled ?? true) && (company.emailSettings?.[key] ?? false));

const interviewScheduleVersion = (interview) =>
  `${new Date(interview.startTime).getTime()}-${interview.rescheduleHistory?.length || 0}`;

const sendInterviewEmail = async ({ userId, interviewId, category, emailType, key, force = false, explicit = false, scheduledFor = new Date() }) => {
  const { user, company } = await ensureUserCompany(userId);
  const { interview, candidate, job } = await getOwnedInterviewBundle(company._id, interviewId);

  if (!candidate.email) throw new ApiError(400, "Candidate has no email address");
  if (!explicit && !force && key === "invitation" && !settingsEnabled(company, "interviewInvitationsEnabled")) {
    return { skipped: true, reason: "Interview invitations are disabled", log: null };
  }
  if (!explicit && !force && key === "reminder" && !settingsEnabled(company, "interviewRemindersEnabled")) {
    return { skipped: true, reason: "Interview reminders are disabled", log: null };
  }

  const suffix =
    key === "invitation"
      ? interviewScheduleVersion(interview)
      : key === "rescheduled"
        ? interview.rescheduleHistory?.length || 0
        : key === "reminder"
          ? `${company.emailSettings?.defaultReminderHours || env.interviewReminderHours}h`
          : "current";
  const automationKey = `interview-${key}:${interview._id}:${suffix}`;

  return sendTemplateEmail({
    company,
    user,
    candidate,
    job,
    interview,
    category,
    emailType,
    scheduledFor,
    automationKey,
    idempotencyKey: force ? "" : automationKey,
    metadata: { forced: force }
  });
};

export const queueInterviewInvitation = (userId, interviewId, { force = false, explicit = false } = {}) =>
  sendInterviewEmail({ userId, interviewId, category: "Interview Invitation", emailType: "Interview Invitation", key: "invitation", force, explicit });

export const queueInterviewReminder = (userId, interviewId, { force = false, explicit = false, scheduledFor = new Date() } = {}) =>
  sendInterviewEmail({ userId, interviewId, category: "Interview Reminder", emailType: "Interview Reminder", key: "reminder", force, explicit, scheduledFor });

export const queueInterviewRescheduledEmail = (userId, interviewId, { force = false, explicit = false } = {}) =>
  sendInterviewEmail({ userId, interviewId, category: "Interview Rescheduled", emailType: "Interview Rescheduled", key: "rescheduled", force, explicit });

export const queueInterviewCancelledEmail = (userId, interviewId, { force = false, explicit = false } = {}) =>
  sendInterviewEmail({ userId, interviewId, category: "Interview Cancelled", emailType: "Interview Cancelled", key: "cancelled", force, explicit });

export const queueCandidateStatusEmail = async (userId, candidateId, status, { force = false, explicit = false } = {}) => {
  const { user, company } = await ensureUserCompany(userId);
  const { candidate, job } = await getOwnedCandidateJob(company._id, candidateId);

  if (!candidate.email) throw new ApiError(400, "Candidate has no email address");
  if (!explicit && !force && !settingsEnabled(company, "candidateStatusEmailsEnabled")) {
    return { skipped: true, reason: "Candidate status emails are disabled", log: null };
  }

  const categories = {
    Shortlisted: "Shortlisted",
    Rejected: "Rejected",
    Selected: "Selected",
    "On Hold": "On Hold"
  };
  const category = categories[status || candidate.status];

  if (!category) {
    throw new ApiError(400, "No candidate status email is available for this status");
  }

  const latestHistory = candidate.statusHistory?.[candidate.statusHistory.length - 1];
  const statusHistoryId = latestHistory?._id || latestHistory?.changedAt || candidate.updatedAt;
  const automationKey = generateIdempotencyKey(`candidate-${category.toLowerCase()}`, candidate._id, statusHistoryId);

  return sendTemplateEmail({
    company,
    user,
    candidate,
    job,
    category,
    emailType: category,
    automationKey,
    idempotencyKey: force ? "" : automationKey,
    metadata: { candidateStatus: candidate.status, forced: force }
  });
};

export const queueShortlistEmail = (userId, candidateId, options = {}) =>
  queueCandidateStatusEmail(userId, candidateId, "Shortlisted", options);

export const queueRejectionEmail = (userId, candidateId, options = {}) =>
  queueCandidateStatusEmail(userId, candidateId, "Rejected", options);

export const queueSelectionEmail = (userId, candidateId, options = {}) =>
  queueCandidateStatusEmail(userId, candidateId, "Selected", options);

export const queueOnHoldEmail = (userId, candidateId, options = {}) =>
  queueCandidateStatusEmail(userId, candidateId, "On Hold", options);

export const queueFollowUpEmail = async (userId, candidateId, options = {}) => {
  const { user, company } = await ensureUserCompany(userId);
  const { candidate, job } = await getOwnedCandidateJob(company._id, candidateId);
  return sendTemplateEmail({
    company,
    user,
    candidate,
    job,
    category: "Follow Up",
    emailType: "Follow Up",
    templateId: options.templateId,
    customSubject: options.subject || "",
    customHtmlBody: options.htmlBody || "",
    customTextBody: options.textBody || "",
    metadata: { manualFollowUp: true, forceFail: Boolean(options.forceFail) }
  });
};

export const queueEligibleInterviewReminders = async (systemUserId = null) => {
  const now = new Date();
  const until = new Date(now.getTime() + env.interviewReminderHours * 60 * 60 * 1000);
  const interviews = await Interview.find({
    status: { $in: ACTIVE_INTERVIEW_STATUSES },
    startTime: { $gt: now, $lte: until }
  })
    .select("_id companyId")
    .lean();

  const results = [];

  for (const interview of interviews) {
    const userId = systemUserId || (await User.findOne({ companyId: interview.companyId, role: "hr", isActive: true }).select("_id").lean())?._id;
    if (!userId) {
      results.push({ interviewId: interview._id.toString(), success: false, error: "No HR user available for reminder" });
      continue;
    }
    try {
      const result = await queueInterviewReminder(userId, interview._id, { force: false });
      results.push({ interviewId: interview._id.toString(), success: true, skipped: result.skipped || result.duplicate || false });
    } catch (error) {
      results.push({ interviewId: interview._id.toString(), success: false, error: error.message });
    }
  }

  return {
    total: results.length,
    queued: results.filter((item) => item.success && !item.skipped).length,
    skipped: results.filter((item) => item.skipped).length,
    failed: results.filter((item) => !item.success).length,
    results
  };
};
