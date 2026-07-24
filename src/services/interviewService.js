import mongoose from "mongoose";
import { ACTIVE_INTERVIEW_STATUSES, getAllowedInterviewStatuses } from "../constants/interviewStatusTransitions.js";
import Candidate from "../models/Candidate.js";
import Company from "../models/Company.js";
import Interview from "../models/Interview.js";
import Job from "../models/Job.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import { buildStatusHistoryEntry } from "./candidateService.js";
import { generateInterviewQuestionsWithAI } from "./aiService.js";

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toObjectId = (value) => new mongoose.Types.ObjectId(value);
const isActiveStatus = (status) => ACTIVE_INTERVIEW_STATUSES.includes(status);
const roundLabel = (interview) => interview.interviewRound === "Custom" ? interview.customRoundLabel : interview.interviewRound;
const roundLabelFromPayload = (payload) => payload.interviewRound === "Custom" ? payload.customRoundLabel : payload.interviewRound;
const candidateStatusOrder = ["Applied", "Resume Parsed", "AI Screening Completed", "Under Review", "Shortlisted", "Interview Scheduled", "Interview Completed", "Selected", "Rejected", "On Hold"];

const getDateRangeForTimezone = (date = new Date(), timezone = "Asia/Kolkata") => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const start = new Date(`${values.year}-${values.month}-${values.day}T00:00:00.000`);
  const end = new Date(`${values.year}-${values.month}-${values.day}T23:59:59.999`);
  return { start, end };
};

const ensureUserCompany = async (userId) => {
  const user = await User.findById(userId);
  if (!user || user.role !== "hr") throw new ApiError(403, "Only HR users can manage interviews");
  if (!user.companyId) throw new ApiError(403, "Company onboarding is required before managing interviews");
  const company = await Company.findOne({ _id: user.companyId, isActive: true });
  if (!company) throw new ApiError(404, "Company not found");
  return { user, company };
};

const getSchedule = (startTime, durationMinutes) => {
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) throw new ApiError(400, "Start time is invalid");
  if (start <= new Date()) throw new ApiError(400, "Interview start time must be in the future");
  const end = new Date(start.getTime() + Number(durationMinutes) * 60 * 1000);
  if (end <= start) throw new ApiError(400, "Interview end time must be after start time");
  const scheduledDate = new Date(start);
  scheduledDate.setHours(0, 0, 0, 0);
  return { start, end, scheduledDate };
};

export const validateCandidateAndJob = async (companyId, candidateId, jobId) => {
  const [candidate, job] = await Promise.all([
    Candidate.findOne({ _id: candidateId, companyId, isDeleted: false }),
    Job.findOne({ _id: jobId, companyId })
  ]);
  if (!candidate) throw new ApiError(404, "Candidate not found");
  if (!job) throw new ApiError(404, "Job not found");
  if (candidate.jobId.toString() !== job._id.toString()) {
    throw new ApiError(400, "Candidate does not belong to the selected job");
  }
  return { candidate, job };
};

const buildInterviewerSnapshots = async (companyId, interviewerIds = [], externalInterviewers = []) => {
  const uniqueIds = [...new Set(interviewerIds.map(String))];
  const users = uniqueIds.length ? await User.find({ _id: { $in: uniqueIds }, companyId, role: "hr", isActive: true }) : [];
  if (users.length !== uniqueIds.length) {
    throw new ApiError(400, "One or more interviewers do not belong to this company");
  }
  return [
    ...users.map((user) => ({
      userId: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    })),
    ...externalInterviewers.map((item) => ({
      userId: null,
      name: item.name,
      email: item.email,
      role: item.role || "Interviewer"
    }))
  ];
};

export const detectInterviewConflict = async ({ companyId, candidateId, interviewerIds = [], startTime, endTime, excludeInterviewId = null }) => {
  const base = {
    companyId,
    status: { $in: ACTIVE_INTERVIEW_STATUSES },
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
    ...(excludeInterviewId ? { _id: { $ne: excludeInterviewId } } : {})
  };
  const candidateConflict = await Interview.findOne({ ...base, candidateId })
    .populate("candidateId", "fullName applicationId")
    .lean();
  if (candidateConflict) {
    throw new ApiError(409, "Candidate has a conflicting active interview", [{
      conflictType: "candidate",
      interviewTitle: candidateConflict.title,
      candidateName: candidateConflict.candidateId?.fullName,
      existingStart: candidateConflict.startTime,
      existingEnd: candidateConflict.endTime
    }]);
  }

  const internalIds = interviewerIds.filter(Boolean);
  if (internalIds.length) {
    const interviewerConflict = await Interview.findOne({ ...base, interviewerIds: { $in: internalIds } })
      .populate("candidateId", "fullName applicationId")
      .lean();
    if (interviewerConflict) {
      throw new ApiError(409, "Interviewer has a conflicting active interview", [{
        conflictType: "interviewer",
        interviewTitle: interviewerConflict.title,
        candidateName: interviewerConflict.candidateId?.fullName,
        existingStart: interviewerConflict.startTime,
        existingEnd: interviewerConflict.endTime
      }]);
    }
  }
};

const detectDuplicateActiveRound = async ({ companyId, candidateId, jobId, interviewRound, customRoundLabel, excludeInterviewId, overrideDuplicateRound, overrideReason }) => {
  const existing = await Interview.findOne({
    companyId,
    candidateId,
    jobId,
    interviewRound,
    customRoundLabel: customRoundLabel || "",
    status: { $in: ACTIVE_INTERVIEW_STATUSES },
    ...(excludeInterviewId ? { _id: { $ne: excludeInterviewId } } : {})
  }).lean();
  if (existing && !overrideDuplicateRound) {
    throw new ApiError(409, `An active ${roundLabelFromPayload({ interviewRound, customRoundLabel })} interview already exists for this candidate`);
  }
  if (existing && overrideDuplicateRound && !overrideReason?.trim()) {
    throw new ApiError(400, "Override reason is required for duplicate active interview rounds");
  }
};

const updateCandidateStatusAfterScheduling = async (candidate, user) => {
  if (candidate.status !== "Shortlisted") return;
  candidate.statusHistory.push(buildStatusHistoryEntry({
    previousStatus: candidate.status,
    newStatus: "Interview Scheduled",
    user,
    note: "Interview scheduled"
  }));
  candidate.status = "Interview Scheduled";
  await candidate.save();
};

const updateCandidateStatusAfterCompletion = async (candidate, user) => {
  if (candidate.status !== "Interview Scheduled") return;
  candidate.statusHistory.push(buildStatusHistoryEntry({
    previousStatus: candidate.status,
    newStatus: "Interview Completed",
    user,
    note: "Interview completed"
  }));
  candidate.status = "Interview Completed";
  await candidate.save();
};

const recalculateRatings = (interview) => {
  const feedback = interview.feedback || [];
  const avg = (key) => {
    const values = feedback.map((item) => item[key]).filter((value) => typeof value === "number");
    return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : null;
  };
  interview.averageTechnicalRating = avg("technicalRating");
  interview.averageCommunicationRating = avg("communicationRating");
  interview.averageProblemSolvingRating = avg("problemSolvingRating");
  interview.averageCultureFitRating = avg("cultureFitRating");
  interview.overallRating = avg("overallRating");

  const recommendations = [...new Set(feedback.map((item) => item.recommendation).filter(Boolean))];
  interview.recommendation = recommendations.length === 0 ? null : recommendations.length === 1 ? recommendations[0] : "Mixed";
};

const populateInterview = (query) =>
  query
    .populate("candidateId", "fullName applicationId status totalExperience currentDesignation parsedResume aiEvaluation")
    .populate("jobId", "title department requiredSkills preferredSkills responsibilities description")
    .populate("createdBy", "name email role")
    .populate("updatedBy", "name email role");

const safeCandidate = (candidate) => candidate && ({
  id: candidate._id?.toString() || candidate.id,
  fullName: candidate.fullName,
  applicationId: candidate.applicationId,
  status: candidate.status,
  totalExperience: candidate.totalExperience,
  currentDesignation: candidate.currentDesignation,
  parsedSkills: candidate.parsedResume?.skills || candidate.parsedResume?.technicalSkills || [],
  overallScore: candidate.aiEvaluation?.overallScore ?? null,
  category: candidate.aiEvaluation?.category ?? null,
  requiredSkillsMissing: candidate.aiEvaluation?.requiredSkillsMissing || [],
  relevantProjects: candidate.aiEvaluation?.relevantProjects || candidate.parsedResume?.projects || []
});

const safeJob = (job) => job && ({
  id: job._id?.toString() || job.id,
  title: job.title,
  department: job.department,
  requiredSkills: job.requiredSkills,
  preferredSkills: job.preferredSkills
});

export const interviewSummaryPayload = (interview, includeDetails = false) => ({
  id: interview._id.toString(),
  title: interview.title,
  applicationId: interview.applicationId,
  candidate: safeCandidate(interview.candidateId),
  job: safeJob(interview.jobId),
  candidateId: interview.candidateId?._id?.toString() || interview.candidateId?.toString(),
  jobId: interview.jobId?._id?.toString() || interview.jobId?.toString(),
  interviewRound: interview.interviewRound,
  customRoundLabel: interview.customRoundLabel,
  roundLabel: roundLabel(interview),
  interviewType: interview.interviewType,
  interviewMode: interview.interviewMode,
  scheduledDate: interview.scheduledDate,
  startTime: interview.startTime,
  endTime: interview.endTime,
  durationMinutes: interview.durationMinutes,
  timezone: interview.timezone,
  interviewers: interview.interviewers,
  status: interview.status,
  meetingLink: interview.meetingLink,
  location: interview.location,
  feedbackCount: interview.feedback?.length || 0,
  overallRating: interview.overallRating,
  recommendation: interview.recommendation,
  createdAt: interview.createdAt,
  updatedAt: interview.updatedAt,
  ...(includeDetails ? {
    instructions: interview.instructions,
    agenda: interview.agenda,
    generatedQuestions: interview.generatedQuestions,
    customQuestions: interview.customQuestions,
    feedback: interview.feedback,
    cancellationReason: interview.cancellationReason,
    rescheduleHistory: interview.rescheduleHistory,
    privateNotes: interview.privateNotes,
    completedAt: interview.completedAt,
    cancelledAt: interview.cancelledAt,
    createdBy: interview.createdBy,
    updatedBy: interview.updatedBy
  } : {})
});

export const createInterview = async (userId, payload) => {
  const { user, company } = await ensureUserCompany(userId);
  const { candidate, job } = await validateCandidateAndJob(company._id, payload.candidateId, payload.jobId);
  const { start, end, scheduledDate } = getSchedule(payload.startTime, payload.durationMinutes);
  await detectInterviewConflict({ companyId: company._id, candidateId: candidate._id, interviewerIds: payload.interviewerIds, startTime: start, endTime: end });
  await detectDuplicateActiveRound({ companyId: company._id, candidateId: candidate._id, jobId: job._id, ...payload });
  const interviewers = await buildInterviewerSnapshots(company._id, payload.interviewerIds, payload.interviewers);

  const interview = await Interview.create({
    ...payload,
    companyId: company._id,
    jobId: job._id,
    candidateId: candidate._id,
    applicationId: candidate.applicationId,
    scheduledDate,
    startTime: start,
    endTime: end,
    interviewers,
    createdBy: user._id,
    updatedBy: user._id
  });
  await updateCandidateStatusAfterScheduling(candidate, user);
  return interviewSummaryPayload(await populateInterview(Interview.findById(interview._id)), true);
};

const buildListFilter = async (companyId, query) => {
  const filter = { companyId };
  if (query.jobId) filter.jobId = query.jobId;
  if (query.candidateId) filter.candidateId = query.candidateId;
  if (query.status) filter.status = query.status;
  if (query.interviewType) filter.interviewType = query.interviewType;
  if (query.interviewMode) filter.interviewMode = query.interviewMode;
  if (query.interviewerId) filter.interviewerIds = query.interviewerId;
  if (query.dateFrom || query.dateTo) {
    filter.startTime = {};
    if (query.dateFrom) filter.startTime.$gte = new Date(query.dateFrom);
    if (query.dateTo) filter.startTime.$lte = new Date(query.dateTo);
  }
  const now = new Date();
  if (query.upcomingOnly) filter.startTime = { ...(filter.startTime || {}), $gte: now };
  if (query.overdueOnly) filter.endTime = { $lt: now }, filter.status = { $in: ACTIVE_INTERVIEW_STATUSES };
  if (query.todayOnly) {
    const { start, end } = getDateRangeForTimezone(new Date(), query.timezone || "Asia/Kolkata");
    filter.startTime = { ...(filter.startTime || {}), $gte: start, $lte: end };
  }
  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), "i");
    const [candidateIds, jobIds] = await Promise.all([
      Candidate.find({ companyId, $or: [{ fullName: regex }, { applicationId: regex }] }).select("_id").lean(),
      Job.find({ companyId, title: regex }).select("_id").lean()
    ]);
    filter.$or = [
      { title: regex },
      { applicationId: regex },
      { "interviewers.name": regex },
      { "interviewers.email": regex },
      { candidateId: { $in: candidateIds.map((item) => item._id) } },
      { jobId: { $in: jobIds.map((item) => item._id) } }
    ];
  }
  return filter;
};

const sortMap = {
  soonest: { startTime: 1 },
  latest: { startTime: -1 },
  "newest-created": { createdAt: -1 },
  "oldest-created": { createdAt: 1 },
  status: { status: 1, startTime: 1 },
  "recently-updated": { updatedAt: -1 }
};

export const getInterviewsForCompany = async (userId, query) => {
  const { company } = await ensureUserCompany(userId);
  const page = Number(query.page || 1);
  const limit = Math.min(Number(query.limit || 10), 100);
  const filter = await buildListFilter(company._id, query);
  const sort = sortMap[query.sort] || sortMap.soonest;
  const [interviews, total] = await Promise.all([
    populateInterview(Interview.find(filter).sort(sort).skip((page - 1) * limit).limit(limit)),
    Interview.countDocuments(filter)
  ]);
  return {
    interviews: interviews.map((interview) => interviewSummaryPayload(interview)),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1
    }
  };
};

export const getInterviewByIdForCompany = async (userId, interviewId) => {
  const { company } = await ensureUserCompany(userId);
  const interview = await populateInterview(Interview.findOne({ _id: interviewId, companyId: company._id }));
  if (!interview) throw new ApiError(404, "Interview not found");
  return interviewSummaryPayload(interview, true);
};

export const updateInterview = async (userId, interviewId, payload) => {
  const { user, company } = await ensureUserCompany(userId);
  const interview = await Interview.findOne({ _id: interviewId, companyId: company._id });
  if (!interview) throw new ApiError(404, "Interview not found");
  if (["Completed", "Cancelled"].includes(interview.status)) throw new ApiError(400, "Completed or cancelled interviews cannot be edited");
  const next = { ...interview.toObject(), ...payload };
  const candidateId = payload.candidateId || interview.candidateId;
  const jobId = payload.jobId || interview.jobId;
  const { candidate, job } = await validateCandidateAndJob(company._id, candidateId, jobId);
  const { start, end, scheduledDate } = getSchedule(payload.startTime || interview.startTime, payload.durationMinutes || interview.durationMinutes);
  await detectInterviewConflict({ companyId: company._id, candidateId: candidate._id, interviewerIds: payload.interviewerIds || interview.interviewerIds, startTime: start, endTime: end, excludeInterviewId: interview._id });
  await detectDuplicateActiveRound({ companyId: company._id, candidateId: candidate._id, jobId: job._id, excludeInterviewId: interview._id, ...next });
  Object.assign(interview, payload, {
    candidateId: candidate._id,
    jobId: job._id,
    applicationId: candidate.applicationId,
    scheduledDate,
    startTime: start,
    endTime: end,
    updatedBy: user._id
  });
  if (payload.interviewerIds || payload.interviewers) {
    interview.interviewers = await buildInterviewerSnapshots(company._id, payload.interviewerIds || interview.interviewerIds, payload.interviewers || []);
  }
  await interview.save();
  return getInterviewByIdForCompany(userId, interview._id);
};

export const rescheduleInterview = async (userId, interviewId, payload) => {
  const { user, company } = await ensureUserCompany(userId);
  const interview = await Interview.findOne({ _id: interviewId, companyId: company._id });
  if (!interview) throw new ApiError(404, "Interview not found");
  if (interview.status === "Completed") throw new ApiError(400, "Completed interviews cannot be rescheduled");
  const { start, end, scheduledDate } = getSchedule(payload.startTime, payload.durationMinutes);
  await detectInterviewConflict({ companyId: company._id, candidateId: interview.candidateId, interviewerIds: interview.interviewerIds, startTime: start, endTime: end, excludeInterviewId: interview._id });
  interview.rescheduleHistory.push({
    previousStartTime: interview.startTime,
    previousEndTime: interview.endTime,
    newStartTime: start,
    newEndTime: end,
    reason: payload.reason,
    changedBy: user._id
  });
  interview.startTime = start;
  interview.endTime = end;
  interview.scheduledDate = scheduledDate;
  interview.durationMinutes = payload.durationMinutes;
  interview.timezone = payload.timezone;
  interview.status = "Rescheduled";
  interview.updatedBy = user._id;
  await interview.save();
  return getInterviewByIdForCompany(userId, interview._id);
};

export const cancelInterview = async (userId, interviewId, reason) => {
  const { user, company } = await ensureUserCompany(userId);
  const interview = await Interview.findOne({ _id: interviewId, companyId: company._id });
  if (!interview) throw new ApiError(404, "Interview not found");
  if (interview.status === "Completed") throw new ApiError(400, "Completed interviews cannot be cancelled");
  interview.status = "Cancelled";
  interview.cancellationReason = reason;
  interview.cancelledAt = new Date();
  interview.updatedBy = user._id;
  await interview.save();
  return getInterviewByIdForCompany(userId, interview._id);
};

export const updateInterviewStatus = async (userId, interviewId, status) => {
  const { user, company } = await ensureUserCompany(userId);
  const interview = await Interview.findOne({ _id: interviewId, companyId: company._id });
  if (!interview) throw new ApiError(404, "Interview not found");
  if (!getAllowedInterviewStatuses(interview.status).includes(status)) {
    throw new ApiError(400, `Cannot change interview status from ${interview.status} to ${status}`);
  }
  interview.status = status;
  interview.updatedBy = user._id;
  if (status === "Completed") interview.completedAt = new Date();
  await interview.save();
  if (status === "Completed") {
    const candidate = await Candidate.findOne({ _id: interview.candidateId, companyId: company._id });
    if (candidate) await updateCandidateStatusAfterCompletion(candidate, user);
  }
  return getInterviewByIdForCompany(userId, interview._id);
};

export const completeInterview = (userId, interviewId) => updateInterviewStatus(userId, interviewId, "Completed");

export const addInterviewFeedback = async (userId, interviewId, payload, feedbackId = null) => {
  const { user, company } = await ensureUserCompany(userId);
  const interview = await Interview.findOne({ _id: interviewId, companyId: company._id });
  if (!interview) throw new ApiError(404, "Interview not found");
  const existing = feedbackId
    ? interview.feedback.id(feedbackId)
    : interview.feedback.find((item) => item.interviewerId.toString() === user._id.toString());
  if (feedbackId && !existing) throw new ApiError(404, "Feedback not found");
  if (!feedbackId && existing) throw new ApiError(409, "Feedback already exists for this interviewer. Use the update feedback action.");
  if (existing && existing.interviewerId.toString() !== user._id.toString()) {
    throw new ApiError(403, "You can edit only your own interview feedback");
  }
  const data = { ...payload, interviewerId: user._id, interviewerName: user.name, updatedAt: new Date() };
  if (existing) Object.assign(existing, data);
  else interview.feedback.push({ ...data, submittedAt: new Date() });
  recalculateRatings(interview);
  interview.updatedBy = user._id;
  await interview.save();
  return getInterviewByIdForCompany(userId, interview._id);
};

export const getCandidateInterviewHistory = async (userId, candidateId) => {
  const { company } = await ensureUserCompany(userId);
  const candidate = await Candidate.findOne({ _id: candidateId, companyId: company._id, isDeleted: false });
  if (!candidate) throw new ApiError(404, "Candidate not found");
  const interviews = await populateInterview(Interview.find({ companyId: company._id, candidateId }).sort({ startTime: -1 }));
  return { interviews: interviews.map((interview) => interviewSummaryPayload(interview)) };
};

export const getUpcomingInterviews = async (userId, { limit = 10, days = 7 } = {}) => {
  const { company } = await ensureUserCompany(userId);
  const now = new Date();
  const until = new Date(now.getTime() + Number(days) * 24 * 60 * 60 * 1000);
  const interviews = await populateInterview(Interview.find({
    companyId: company._id,
    status: { $in: ACTIVE_INTERVIEW_STATUSES },
    startTime: { $gte: now, $lte: until }
  }).sort({ startTime: 1 }).limit(Math.min(Number(limit), 50)));
  return { interviews: interviews.map((interview) => interviewSummaryPayload(interview)) };
};

export const getTodayInterviews = async (userId, timezone = "Asia/Kolkata") => {
  const { company } = await ensureUserCompany(userId);
  const { start, end } = getDateRangeForTimezone(new Date(), timezone);
  const interviews = await populateInterview(Interview.find({ companyId: company._id, startTime: { $gte: start, $lte: end } }).sort({ startTime: 1 }));
  return { interviews: interviews.map((interview) => interviewSummaryPayload(interview)) };
};

export const getInterviewSummary = async (userId, timezone = "Asia/Kolkata") => {
  const { company } = await ensureUserCompany(userId);
  const now = new Date();
  const { start: todayStart, end: todayEnd } = getDateRangeForTimezone(now, timezone);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const [statusCounts, averages, today, upcoming, overdue, thisWeek] = await Promise.all([
    Interview.aggregate([{ $match: { companyId: toObjectId(company._id) } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Interview.aggregate([{ $match: { companyId: toObjectId(company._id), overallRating: { $ne: null } } }, { $group: { _id: "$recommendation", count: { $sum: 1 }, averageRating: { $avg: "$overallRating" } } }]),
    Interview.countDocuments({ companyId: company._id, startTime: { $gte: todayStart, $lte: todayEnd } }),
    Interview.countDocuments({ companyId: company._id, status: { $in: ACTIVE_INTERVIEW_STATUSES }, startTime: { $gte: now } }),
    Interview.countDocuments({ companyId: company._id, status: { $in: ACTIVE_INTERVIEW_STATUSES }, endTime: { $lt: now } }),
    Interview.countDocuments({ companyId: company._id, startTime: { $gte: weekStart } })
  ]);
  const byStatus = Object.fromEntries(statusCounts.map((item) => [item._id, item.count]));
  const rec = Object.fromEntries(averages.map((item) => [item._id || "Unrated", item.count]));
  const ratingValues = averages.map((item) => item.averageRating).filter((value) => typeof value === "number");
  return {
    totalInterviews: Object.values(byStatus).reduce((sum, value) => sum + value, 0),
    scheduled: byStatus.Scheduled || 0,
    rescheduled: byStatus.Rescheduled || 0,
    inProgress: byStatus["In Progress"] || 0,
    completed: byStatus.Completed || 0,
    cancelled: byStatus.Cancelled || 0,
    noShow: byStatus["No Show"] || 0,
    today,
    upcoming,
    overdue,
    interviewsThisWeek: thisWeek,
    averageRating: ratingValues.length ? Math.round((ratingValues.reduce((sum, value) => sum + value, 0) / ratingValues.length) * 100) / 100 : null,
    strongHireRecommendations: rec["Strong Hire"] || 0,
    hireRecommendations: rec.Hire || 0,
    furtherReviewRecommendations: rec["Further Review"] || 0,
    noHireRecommendations: (rec["No Hire"] || 0) + (rec["Strong No Hire"] || 0)
  };
};

export const generateQuestionsForInterview = async (userId, interviewId, payload) => {
  const { user, company } = await ensureUserCompany(userId);
  const interview = await populateInterview(Interview.findOne({ _id: interviewId, companyId: company._id }));
  if (!interview) throw new ApiError(404, "Interview not found");
  const result = await generateInterviewQuestionsWithAI({
    job: interview.jobId,
    candidate: interview.candidateId,
    interviewType: interview.interviewType,
    interviewRound: roundLabel(interview),
    ...payload
  });
  interview.generatedQuestions = result.questions.map((question) => ({
    ...question,
    source: result.provider === "mock" ? "Mock AI" : "AI",
    createdAt: new Date()
  }));
  interview.updatedBy = user._id;
  await interview.save();
  return {
    interview: interviewSummaryPayload(await populateInterview(Interview.findById(interview._id)), true),
    provider: result.provider,
    model: result.model,
    fallbackUsed: result.fallbackUsed,
    safeWarning: result.safeWarning || null
  };
};
