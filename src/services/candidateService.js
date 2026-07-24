import path from "path";
import { candidateStatusTransitions, requiresCandidateStatusNote } from "../constants/candidateStatusTransitions.js";
import Candidate from "../models/Candidate.js";
import Company from "../models/Company.js";
import Job from "../models/Job.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import { generateApplicationId } from "../utils/generateApplicationId.js";
import {
  deleteStoredFile,
  getResumeAbsolutePath,
  getResumeAccessPath,
  saveResumeMetadata,
  validateStoredFileExists
} from "./fileStorageService.js";
import { extractResumeText, parseResumeWithFallback } from "./resumeParserService.js";
import { evaluateCandidateWithAI } from "./aiService.js";
import { AI_SCREENING_VERSION, scoreCandidateForJob } from "./candidateScoringService.js";

export { candidateStatusTransitions };

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isPastDate = (date) => {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value < new Date();
};

const ensureUserCompany = async (userId) => {
  const user = await User.findById(userId);

  if (!user || user.role !== "hr") {
    throw new ApiError(403, "Only HR users can manage candidates");
  }

  if (!user.companyId) {
    throw new ApiError(403, "Company onboarding is required before managing candidates");
  }

  const company = await Company.findOne({ _id: user.companyId, isActive: true });

  if (!company) {
    throw new ApiError(404, "Company not found");
  }

  return { user, company };
};

export const buildStatusHistoryEntry = ({ previousStatus = null, newStatus, user = null, note = "" }) => ({
  previousStatus,
  newStatus,
  changedBy: user?._id || null,
  changedByRole: user?.role || "candidate",
  note,
  changedAt: new Date()
});

export const validateJobForApplication = async (jobSlug) => {
  const job = await Job.findOne({ publicApplicationSlug: jobSlug })
    .populate("companyId", "name logo website industry size city state country isActive");

  if (!job || job.status !== "Active") {
    throw new ApiError(404, "Job is unavailable");
  }

  if (isPastDate(job.deadline)) {
    throw new ApiError(400, "This job application deadline has passed");
  }

  if (!job.companyId?.isActive) {
    throw new ApiError(404, "Job is unavailable");
  }

  return job;
};

export const checkDuplicateApplication = async (jobId, email, excludeCandidateId = null) => {
  const filter = { jobId, email: email.toLowerCase(), isDeleted: false };

  if (excludeCandidateId) {
    filter._id = { $ne: excludeCandidateId };
  }

  const duplicate = await Candidate.exists(filter);

  if (duplicate) {
    throw new ApiError(409, "An application already exists for this job and email");
  }
};

const normalizeAnswerValue = (question, rawAnswer) => {
  if (rawAnswer === undefined || rawAnswer === null || rawAnswer === "") {
    if (question.required) {
      throw new ApiError(400, `Answer is required for: ${question.question}`);
    }

    return null;
  }

  if (question.type === "number") {
    const numeric = Number(rawAnswer);
    if (Number.isNaN(numeric)) {
      throw new ApiError(400, `Answer must be numeric for: ${question.question}`);
    }
    return numeric;
  }

  if (question.type === "select") {
    const answer = String(rawAnswer).trim();
    if (!question.options.includes(answer)) {
      throw new ApiError(400, `Invalid option selected for: ${question.question}`);
    }
    return answer;
  }

  if (question.type === "yes-no") {
    const answer = String(rawAnswer).trim().toLowerCase();
    if (!["yes", "no"].includes(answer)) {
      throw new ApiError(400, `Answer must be yes or no for: ${question.question}`);
    }
    return answer;
  }

  const answer = String(rawAnswer).trim();
  if (answer.length > 2000) {
    throw new ApiError(400, `Answer is too long for: ${question.question}`);
  }

  if (question.required && !answer) {
    throw new ApiError(400, `Answer is required for: ${question.question}`);
  }

  return answer || null;
};

export const validateScreeningAnswers = (job, submittedAnswers = []) => {
  const submittedById = new Map(submittedAnswers.map((item) => [item.questionId, item.answer]));
  const questionIds = new Set((job.screeningQuestions || []).map((question) => question.key));

  submittedAnswers.forEach((item) => {
    if (!questionIds.has(item.questionId)) {
      throw new ApiError(400, "Unknown screening question submitted");
    }
  });

  return (job.screeningQuestions || [])
    .sort((a, b) => a.order - b.order)
    .map((question) => {
      const answer = normalizeAnswerValue(question, submittedById.get(question.key));

      if (answer === null && !question.required) {
        return null;
      }

      return {
        questionId: question.key,
        question: question.question,
        type: question.type,
        answer
      };
    })
    .filter(Boolean);
};

const candidatePayload = (payload) => ({
  fullName: payload.fullName,
  email: payload.email,
  phone: payload.phone,
  location: payload.location || "",
  totalExperience: payload.totalExperience ?? 0,
  currentCompany: payload.currentCompany || "",
  currentDesignation: payload.currentDesignation || "",
  expectedSalary: payload.expectedSalary ?? null,
  noticePeriod: payload.noticePeriod || "",
  linkedinUrl: payload.linkedinUrl || "",
  githubUrl: payload.githubUrl || "",
  portfolioUrl: payload.portfolioUrl || "",
  coverLetter: payload.coverLetter || ""
});

export const createPublicApplication = async (jobSlug, payload, file) => {
  const job = await validateJobForApplication(jobSlug);
  await checkDuplicateApplication(job._id, payload.email);

  const screeningAnswers = validateScreeningAnswers(job, payload.screeningAnswers);
  const applicationId = await generateApplicationId(Candidate);
  const candidate = new Candidate({
    ...candidatePayload(payload),
    ...saveResumeMetadata(file),
    applicationId,
    jobId: job._id,
    companyId: job.companyId._id,
    source: "Public Application",
    status: "Applied",
    statusHistory: [
      buildStatusHistoryEntry({
        newStatus: "Applied",
        note: "Application submitted"
      })
    ],
    screeningAnswers,
    appliedAt: new Date()
  });

  try {
    await candidate.save();
    candidate.resumeUrl = getResumeAccessPath(candidate._id.toString());
    await candidate.save();
  } catch (error) {
    await deleteStoredFile(file.filename);
    throw error.code === 11000
      ? new ApiError(409, "An application already exists for this job and email")
      : error;
  }

  return {
    applicationId: candidate.applicationId,
    candidateName: candidate.fullName,
    jobTitle: job.title,
    companyName: job.companyId.name,
    status: candidate.status,
    appliedAt: candidate.appliedAt,
    jobSlug: job.publicApplicationSlug
  };
};

export const createCandidateByHR = async (userId, jobId, payload, file) => {
  const { user, company } = await ensureUserCompany(userId);
  const job = await Job.findOne({ _id: jobId, companyId: company._id });

  if (!job) {
    throw new ApiError(404, "Job not found");
  }

  await checkDuplicateApplication(job._id, payload.email);
  const applicationId = await generateApplicationId(Candidate);
  const candidate = new Candidate({
    ...candidatePayload(payload),
    ...saveResumeMetadata(file),
    applicationId,
    jobId: job._id,
    companyId: company._id,
    source: payload.source || "HR Upload",
    status: "Applied",
    statusHistory: [
      buildStatusHistoryEntry({
        newStatus: "Applied",
        user,
        note: "Candidate uploaded by HR"
      })
    ],
    screeningAnswers: [],
    createdBy: user._id,
    appliedAt: new Date()
  });

  try {
    await candidate.save();
    candidate.resumeUrl = getResumeAccessPath(candidate._id.toString());
    await candidate.save();
  } catch (error) {
    await deleteStoredFile(file.filename);
    throw error.code === 11000
      ? new ApiError(409, "An application already exists for this job and email")
      : error;
  }

  return getCandidateByIdForCompany(userId, candidate._id);
};

const candidateSortMap = {
  newest: { appliedAt: -1 },
  oldest: { appliedAt: 1 },
  "name-asc": { fullName: 1 },
  "name-desc": { fullName: -1 },
  "experience-asc": { totalExperience: 1 },
  "experience-desc": { totalExperience: -1 },
  status: { status: 1 },
  "application-id": { applicationId: 1 },
  "score-desc": { "aiEvaluation.overallScore": -1, aiScreenedAt: -1 },
  "score-asc": { "aiEvaluation.overallScore": 1, aiScreenedAt: -1 },
  category: { "aiEvaluation.category": 1, "aiEvaluation.overallScore": -1 },
  "screened-newest": { aiScreenedAt: -1 },
  "screened-oldest": { aiScreenedAt: 1 },
  "recently-screened": { aiScreenedAt: -1 },
  "oldest-screening": { aiScreenedAt: 1 },
  "last-updated": { updatedAt: -1 },
  "job-title": { jobId: 1 }
};

const buildCandidateFilter = async (companyId, query) => {
  const filter = { companyId, isDeleted: false };
  let searchedJobIds = [];

  if (query.jobId) filter.jobId = query.jobId;
  if (query.status) filter.status = query.status;
  if (query.source) filter.source = query.source;
  if (query.resumeParseStatus) filter.resumeParseStatus = query.resumeParseStatus;
  if (query.aiScreeningStatus) filter.aiScreeningStatus = query.aiScreeningStatus;
  if (query.category) filter["aiEvaluation.category"] = query.category;
  if (query.noticePeriod) filter.noticePeriod = query.noticePeriod;
  if (query.hasResume !== undefined) {
    filter.resumeStoredName = query.hasResume ? { $nin: ["", null] } : { $in: ["", null] };
  }
  if (query.hasParsedResume !== undefined) {
    filter.parsedResume = query.hasParsedResume ? { $ne: null } : null;
  }
  if (query.hasAiEvaluation !== undefined) {
    filter.aiEvaluation = query.hasAiEvaluation ? { $ne: null } : null;
  }
  if (query.scoreMin !== undefined || query.scoreMax !== undefined) {
    filter["aiEvaluation.overallScore"] = {};
    if (query.scoreMin !== undefined) filter["aiEvaluation.overallScore"].$gte = query.scoreMin;
    if (query.scoreMax !== undefined) filter["aiEvaluation.overallScore"].$lte = query.scoreMax;
  }
  if (query.requiredSkill) {
    filter["aiEvaluation.requiredSkillsFound.skill"] = new RegExp(escapeRegex(query.requiredSkill), "i");
  }
  if (query.missingSkill) {
    filter["aiEvaluation.requiredSkillsMissing.skill"] = new RegExp(escapeRegex(query.missingSkill), "i");
  }

  if (query.experienceMin !== undefined || query.experienceMax !== undefined) {
    filter.totalExperience = {};
    if (query.experienceMin !== undefined) filter.totalExperience.$gte = query.experienceMin;
    if (query.experienceMax !== undefined) filter.totalExperience.$lte = query.experienceMax;
  }

  if (query.appliedFrom || query.appliedTo) {
    filter.appliedAt = {};
    if (query.appliedFrom) filter.appliedAt.$gte = query.appliedFrom;
    if (query.appliedTo) filter.appliedAt.$lte = query.appliedTo;
  }

  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), "i");
    const jobs = await Job.find({
      companyId,
      $or: [{ title: regex }, { requiredSkills: regex }, { preferredSkills: regex }]
    }).select("_id").lean();
    searchedJobIds = jobs.map((job) => job._id);
    filter.$or = [
      { fullName: regex },
      { email: regex },
      { phone: regex },
      { location: regex },
      { currentCompany: regex },
      { currentDesignation: regex },
      { applicationId: regex },
      { "parsedResume.skills": regex },
      { "parsedResume.technicalSkills": regex },
      ...(searchedJobIds.length ? [{ jobId: { $in: searchedJobIds } }] : [])
    ];
  }

  return filter;
};

const mapCandidateListItem = (candidate) => ({
  id: candidate._id.toString(),
  applicationId: candidate.applicationId,
  fullName: candidate.fullName,
  email: candidate.email,
  phone: candidate.phone,
  location: candidate.location,
  totalExperience: candidate.totalExperience,
  currentCompany: candidate.currentCompany,
  currentDesignation: candidate.currentDesignation,
  source: candidate.source,
  status: candidate.status,
  aiEvaluation: null,
  aiScreeningStatus: candidate.aiScreeningStatus || "Not Screened",
  aiScreeningError: candidate.aiScreeningError || null,
  aiScreenedAt: candidate.aiScreenedAt || null,
  overallScore: candidate.aiEvaluation?.overallScore ?? null,
  category: candidate.aiEvaluation?.category ?? null,
  requiredSkillsFound: candidate.aiEvaluation?.requiredSkillsFound || [],
  requiredSkillsMissing: candidate.aiEvaluation?.requiredSkillsMissing || [],
  isAiEvaluationOutdated: isAiEvaluationOutdated(candidate, candidate.jobId),
  resumeParseStatus: candidate.resumeParseStatus,
  hasResume: Boolean(candidate.resumeStoredName || candidate.resumeUrl),
  hasParsedResume: Boolean(candidate.parsedResume),
  hasAiEvaluation: Boolean(candidate.aiEvaluation),
  appliedAt: candidate.appliedAt,
  createdAt: candidate.createdAt,
  updatedAt: candidate.updatedAt,
  job: candidate.jobId
    ? {
        id: candidate.jobId._id.toString(),
        title: candidate.jobId.title,
        department: candidate.jobId.department,
        status: candidate.jobId.status,
        location: candidate.jobId.location
      }
    : null
});

const buildCandidateSummary = async (companyId, filter = { companyId, isDeleted: false }) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  const [summary] = await Candidate.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        applied: { $sum: { $cond: [{ $eq: ["$status", "Applied"] }, 1, 0] } },
        resumeParsed: { $sum: { $cond: [{ $eq: ["$resumeParseStatus", "Parsed"] }, 1, 0] } },
        aiScreened: { $sum: { $cond: [{ $eq: ["$aiScreeningStatus", "Screened"] }, 1, 0] } },
        underReview: { $sum: { $cond: [{ $eq: ["$status", "Under Review"] }, 1, 0] } },
        shortlisted: { $sum: { $cond: [{ $eq: ["$status", "Shortlisted"] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ["$status", "Rejected"] }, 1, 0] } },
        onHold: { $sum: { $cond: [{ $eq: ["$status", "On Hold"] }, 1, 0] } },
        selected: { $sum: { $cond: [{ $eq: ["$status", "Selected"] }, 1, 0] } },
        applicationsToday: { $sum: { $cond: [{ $gte: ["$appliedAt", today] }, 1, 0] } },
        applicationsThisWeek: { $sum: { $cond: [{ $gte: ["$appliedAt", weekStart] }, 1, 0] } },
        averageAiScore: { $avg: "$aiEvaluation.overallScore" },
        excellentMatches: { $sum: { $cond: [{ $eq: ["$aiEvaluation.category", "Excellent Match"] }, 1, 0] } },
        goodMatches: { $sum: { $cond: [{ $eq: ["$aiEvaluation.category", "Good Match"] }, 1, 0] } },
        needsResumeParsing: { $sum: { $cond: [{ $ne: ["$resumeParseStatus", "Parsed"] }, 1, 0] } },
        needsAiScreening: { $sum: { $cond: [{ $ne: ["$aiScreeningStatus", "Screened"] }, 1, 0] } }
      }
    }
  ]);

  return {
    total: summary?.total || 0,
    applied: summary?.applied || 0,
    resumeParsed: summary?.resumeParsed || 0,
    aiScreened: summary?.aiScreened || 0,
    underReview: summary?.underReview || 0,
    shortlisted: summary?.shortlisted || 0,
    rejected: summary?.rejected || 0,
    onHold: summary?.onHold || 0,
    selected: summary?.selected || 0,
    applicationsToday: summary?.applicationsToday || 0,
    applicationsThisWeek: summary?.applicationsThisWeek || 0,
    averageAiScore: Math.round(summary?.averageAiScore || 0),
    excellentMatches: summary?.excellentMatches || 0,
    goodMatches: summary?.goodMatches || 0,
    candidatesNeedingResumeParsing: summary?.needsResumeParsing || 0,
    candidatesNeedingAiScreening: summary?.needsAiScreening || 0,
    outdatedAiEvaluations: 0
  };
};

export const getCandidatesForCompany = async (userId, query) => {
  const { company } = await ensureUserCompany(userId);
  const page = query.page;
  const limit = Math.min(query.limit, 100);
  const skip = (page - 1) * limit;
  const filter = await buildCandidateFilter(company._id, query);

  const [candidates, total, summary] = await Promise.all([
    Candidate.find(filter)
      .select("-statusHistory -recruiterNotes -screeningAnswers")
      .populate("jobId", "title department status updatedAt")
      .sort(candidateSortMap[query.sort] || candidateSortMap.newest)
      .skip(skip)
      .limit(limit)
      .lean(),
    Candidate.countDocuments(filter),
    buildCandidateSummary(company._id, filter)
  ]);
  const pages = Math.ceil(total / limit);

  return {
    candidates: candidates.map(mapCandidateListItem),
    pagination: {
      page,
      limit,
      total,
      pages,
      hasNextPage: page < pages,
      hasPreviousPage: page > 1
    },
    summary
  };
};

export const getCandidatesByJobForCompany = async (userId, jobId, query) => {
  const { company } = await ensureUserCompany(userId);
  const job = await Job.findOne({ _id: jobId, companyId: company._id }).lean();

  if (!job) {
    throw new ApiError(404, "Job not found");
  }

  return getCandidatesForCompany(userId, { ...query, jobId });
};

export const getCandidateByIdForCompany = async (userId, candidateId, includeStoragePath = false) => {
  const { company } = await ensureUserCompany(userId);
  const select = includeStoragePath ? "+resumeStoragePath" : "";
  const candidate = await Candidate.findOne({ _id: candidateId, companyId: company._id, isDeleted: false })
    .select(select)
    .populate("jobId", "title department status publicApplicationSlug updatedAt location employmentType workMode requiredSkills preferredSkills minimumExperience maximumExperience education")
    .populate("companyId", "name logo industry city state country")
    .populate("createdBy", "name email role")
    .populate("resumeParsedBy", "name email role")
    .populate("statusHistory.changedBy", "name email role");

  if (!candidate) {
    throw new ApiError(404, "Candidate not found");
  }

  return candidate;
};

export const updateCandidateForCompany = async (userId, candidateId, payload) => {
  const candidate = await getCandidateByIdForCompany(userId, candidateId);

  if (payload.email && payload.email !== candidate.email) {
    await checkDuplicateApplication(candidate.jobId._id, payload.email, candidate._id);
  }

  Object.keys(payload).forEach((key) => {
    candidate[key] = payload[key];
  });

  try {
    await candidate.save();
  } catch (error) {
    throw error.code === 11000
      ? new ApiError(409, "An application already exists for this job and email")
      : error;
  }

  return getCandidateByIdForCompany(userId, candidate._id);
};

export const updateCandidateStatus = async (userId, candidateId, nextStatus, note = "") => {
  const { user } = await ensureUserCompany(userId);
  const candidate = await getCandidateByIdForCompany(userId, candidateId);
  const previousStatus = candidate.status;

  if (previousStatus === nextStatus) return candidate;

  if (!candidateStatusTransitions[previousStatus]?.includes(nextStatus)) {
    throw new ApiError(400, `Cannot change candidate status from ${previousStatus} to ${nextStatus}`);
  }

  if (requiresCandidateStatusNote(previousStatus, nextStatus) && !note?.trim()) {
    throw new ApiError(400, "A note is required for this status change");
  }

  candidate.status = nextStatus;
  candidate.statusHistory.push(
    buildStatusHistoryEntry({
      previousStatus,
      newStatus: nextStatus,
      user,
      note
    })
  );
  await candidate.save();
  return getCandidateByIdForCompany(userId, candidate._id);
};

export const deleteCandidateForCompany = async (userId, candidateId, deletionReason = "") => {
  const { user } = await ensureUserCompany(userId);
  const candidate = await getCandidateByIdForCompany(userId, candidateId, true);

  if (["Shortlisted", "Selected", "Interview Scheduled", "Interview Completed"].includes(candidate.status) && !deletionReason?.trim()) {
    throw new ApiError(400, "A deletion reason is required for this candidate status");
  }

  candidate.isDeleted = true;
  candidate.deletedAt = new Date();
  candidate.deletedBy = user._id;
  candidate.deletionReason = deletionReason || "Soft-deleted by recruiter";
  await candidate.save();
  await Job.findByIdAndUpdate(candidate.jobId._id || candidate.jobId, { $inc: { candidateCount: -1 } });

  return { action: "deleted" };
};

export const getCandidateStatusHistory = async (userId, candidateId) => {
  const candidate = await getCandidateByIdForCompany(userId, candidateId);
  return candidate.statusHistory
    .slice()
    .sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt))
    .map((item) => ({
      previousStatus: item.previousStatus,
      newStatus: item.newStatus,
      changedBy: item.changedBy
        ? {
            name: item.changedBy.name,
            role: item.changedBy.role
          }
        : null,
      changedByRole: item.changedByRole,
      note: item.note,
      changedAt: item.changedAt
    }));
};

export const getCandidateStatusPublicly = async (applicationId, email) => {
  const candidate = await Candidate.findOne({
    applicationId: applicationId.toUpperCase(),
    email: email.toLowerCase(),
    isDeleted: false
  })
    .populate("jobId", "title")
    .populate("companyId", "name")
    .lean();

  if (!candidate) {
    throw new ApiError(404, "No matching application was found");
  }

  return {
    applicationId: candidate.applicationId,
    candidateName: candidate.fullName,
    jobTitle: candidate.jobId?.title,
    companyName: candidate.companyId?.name,
    status: candidate.status,
    appliedAt: candidate.appliedAt,
    lastStatusUpdateAt: candidate.statusHistory?.at(-1)?.changedAt || candidate.updatedAt
  };
};

export const getCandidateResumeForCompany = async (userId, candidateId) => {
  const candidate = await getCandidateByIdForCompany(userId, candidateId, true);
  const absolutePath = await validateStoredFileExists(candidate.resumeStoredName);
  const resolved = path.resolve(absolutePath);

  if (resolved !== path.resolve(getResumeAbsolutePath(candidate.resumeStoredName))) {
    throw new ApiError(400, "Invalid stored resume path");
  }

  return {
    absolutePath,
    originalName: candidate.resumeOriginalName,
    mimeType: candidate.resumeMimeType
  };
};

export const ensureCandidateResumeExists = async (userId, candidateId) => {
  const candidate = await getCandidateByIdForCompany(userId, candidateId, true);
  const absolutePath = await validateStoredFileExists(candidate.resumeStoredName);
  return { candidate, absolutePath };
};

export const acquireResumeParsingLock = async (userId, candidateId, force = false) => {
  const { company } = await ensureUserCompany(userId);

  const candidate = await Candidate.findOne({ _id: candidateId, companyId: company._id, isDeleted: false }).select("+resumeStoragePath");

  if (!candidate) {
    throw new ApiError(404, "Candidate not found");
  }

  if (candidate.resumeParseStatus === "Parsed" && !force) {
    return { locked: false, candidate };
  }

  if (candidate.resumeParseStatus === "Processing") {
    throw new ApiError(409, "Resume parsing is already in progress");
  }

  const lockedCandidate = await Candidate.findOneAndUpdate(
    { _id: candidateId, companyId: company._id, isDeleted: false, resumeParseStatus: { $ne: "Processing" } },
    {
      $set: { resumeParseStatus: "Processing", resumeParseError: null },
      $inc: { resumeParseAttempts: 1 }
    },
    { new: true }
  ).select("+resumeStoragePath");

  if (!lockedCandidate) {
    throw new ApiError(409, "Resume parsing is already in progress");
  }

  return { locked: true, candidate: lockedCandidate };
};

export const updateCandidateStatusAfterParsing = (candidate, user) => {
  if (candidate.status !== "Applied") return;

  candidate.statusHistory.push(
    buildStatusHistoryEntry({
      previousStatus: "Applied",
      newStatus: "Resume Parsed",
      user,
      note: "Resume parsed successfully"
    })
  );
  candidate.status = "Resume Parsed";
};

const safeParseError = (message = "Resume parsing failed") =>
  String(message)
    .replace(/[A-Za-z]:\\[^\s)]+/g, "[path]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[api-key]")
    .slice(0, 500);

export const updateResumeParsingFailure = async (candidateId, status, message, extraction = {}) => {
  await Candidate.findByIdAndUpdate(candidateId, {
    $set: {
      resumeParseStatus: status,
      resumeParseError: safeParseError(message),
      extractedResumeText: extraction.text || null,
      resumeTextLength: extraction.textLength || 0,
      resumeTextTruncated: Boolean(extraction.truncated)
    }
  });
};

export const updateResumeParsingSuccess = async (candidate, user, extraction, parsedResult) => {
  candidate.extractedResumeText = extraction.text;
  candidate.parsedResume = parsedResult.parsedResume;
  candidate.resumeParseStatus = "Parsed";
  candidate.resumeParseError = parsedResult.safeWarning || null;
  candidate.resumeParsedAt = new Date();
  candidate.resumeParsedBy = user._id;
  candidate.resumeParserVersion = "v1";
  candidate.resumeTextLength = extraction.textLength;
  candidate.resumeParserProvider = parsedResult.provider;
  candidate.resumeParserModel = parsedResult.model;
  candidate.resumeTextTruncated = Boolean(extraction.truncated);
  candidate.resumeParserFallbackUsed = Boolean(parsedResult.fallbackUsed);
  updateCandidateStatusAfterParsing(candidate, user);
  await candidate.save();
};

export const parseCandidateResumeForCompany = async (userId, candidateId, force = false) => {
  const { user } = await ensureUserCompany(userId);
  const { locked, candidate } = await acquireResumeParsingLock(userId, candidateId, force);

  if (!locked) {
    return {
      candidateId: candidate._id.toString(),
      parseStatus: candidate.resumeParseStatus,
      parsedAt: candidate.resumeParsedAt,
      parserProvider: candidate.resumeParserProvider,
      textLength: candidate.resumeTextLength,
      parsedResume: candidate.parsedResume
    };
  }

  try {
    const absolutePath = await validateStoredFileExists(candidate.resumeStoredName);
    const extraction = await extractResumeText(absolutePath, candidate.resumeMimeType);

    if (extraction.isLikelyScanned) {
      await updateResumeParsingFailure(
        candidate._id,
        "Needs OCR",
        "This PDF appears to be scanned or image-based. OCR is not available for this file yet.",
        extraction
      );
      throw new ApiError(422, "This PDF appears to be scanned or image-based. OCR is not available for this file yet.");
    }

    if (!extraction.text?.trim()) {
      await updateResumeParsingFailure(candidate._id, "Failed", "No selectable resume text was found", extraction);
      throw new ApiError(422, "No selectable resume text was found");
    }

    const parsedResult = await parseResumeWithFallback(extraction.text);
    await updateResumeParsingSuccess(candidate, user, extraction, parsedResult);
    const freshCandidate = await getCandidateByIdForCompany(userId, candidate._id);

    return {
      candidateId: candidate._id.toString(),
      parseStatus: freshCandidate.resumeParseStatus,
      parsedAt: freshCandidate.resumeParsedAt,
      parserProvider: freshCandidate.resumeParserProvider,
      textLength: freshCandidate.resumeTextLength,
      parsedResume: freshCandidate.parsedResume,
      fallbackUsed: freshCandidate.resumeParserFallbackUsed
    };
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 422) throw error;
    await updateResumeParsingFailure(candidate._id, "Failed", error.message || "Resume parsing failed");
    throw error instanceof ApiError ? error : new ApiError(500, "Resume parsing failed");
  }
};

export const getCandidateResumeDataForCompany = async (userId, candidateId) => {
  const candidate = await getCandidateByIdForCompany(userId, candidateId);

  return {
    candidateId: candidate._id.toString(),
    parseStatus: candidate.resumeParseStatus,
    parseError: candidate.resumeParseError,
    parsedAt: candidate.resumeParsedAt,
    parserVersion: candidate.resumeParserVersion,
    provider: candidate.resumeParserProvider,
    model: candidate.resumeParserModel,
    textLength: candidate.resumeTextLength,
    attempts: candidate.resumeParseAttempts,
    truncationOccurred: candidate.resumeTextTruncated,
    fallbackUsed: candidate.resumeParserFallbackUsed,
    parsedResume: candidate.parsedResume
  };
};

const notePayload = (note) => ({
  id: note._id.toString(),
  text: note.text,
  createdBy: note.createdBy?.toString?.() || note.createdBy,
  createdByName: note.createdByName,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
  edited: note.createdAt && note.updatedAt ? new Date(note.updatedAt).getTime() > new Date(note.createdAt).getTime() : false
});

export const addRecruiterNoteForCompany = async (userId, candidateId, text) => {
  const { user } = await ensureUserCompany(userId);
  const candidate = await getCandidateByIdForCompany(userId, candidateId);
  candidate.recruiterNotes.push({
    text,
    createdBy: user._id,
    createdByName: user.name || user.email
  });
  await candidate.save();
  const created = candidate.recruiterNotes[candidate.recruiterNotes.length - 1];
  return notePayload(created);
};

const findOwnedNote = (candidate, noteId, userId) => {
  const note = candidate.recruiterNotes.id(noteId);
  if (!note) throw new ApiError(404, "Recruiter note not found");
  if (String(note.createdBy) !== String(userId)) {
    throw new ApiError(403, "Only the note author can modify this note");
  }
  return note;
};

export const updateRecruiterNoteForCompany = async (userId, candidateId, noteId, text) => {
  const candidate = await getCandidateByIdForCompany(userId, candidateId);
  const note = findOwnedNote(candidate, noteId, userId);
  note.text = text;
  note.updatedAt = new Date();
  await candidate.save();
  return notePayload(note);
};

export const deleteRecruiterNoteForCompany = async (userId, candidateId, noteId) => {
  const candidate = await getCandidateByIdForCompany(userId, candidateId);
  const note = findOwnedNote(candidate, noteId, userId);
  note.deleteOne();
  await candidate.save();
  return { action: "deleted", noteId };
};

export const bulkCandidateActionForCompany = async (userId, candidateIds = [], action, payload = {}) => {
  await ensureUserCompany(userId);
  const uniqueIds = [...new Set(candidateIds.map(String))];
  const results = [];

  for (const candidateId of uniqueIds) {
    try {
      if (action === "change-status") {
        const candidate = await updateCandidateStatus(userId, candidateId, payload.status, payload.note);
        results.push({ candidateId, success: true, status: candidate.status });
      } else if (action === "soft-delete") {
        await deleteCandidateForCompany(userId, candidateId, payload.deletionReason || payload.note);
        results.push({ candidateId, success: true });
      } else if (action === "export") {
        results.push({ candidateId, success: true });
      }
    } catch (error) {
      results.push({ candidateId, success: false, error: error.message || "Bulk action failed" });
    }
  }

  return {
    total: results.length,
    successful: results.filter((item) => item.success).length,
    failed: results.filter((item) => !item.success).length,
    results
  };
};

const educationSummary = (parsedResume = {}) =>
  ((parsedResume || {}).education || [])
    .map((item) => [item.degree, item.fieldOfStudy].filter(Boolean).join(" in "))
    .filter(Boolean)
    .slice(0, 3);

export const compareCandidatesForCompany = async (userId, candidateIds = []) => {
  const { company } = await ensureUserCompany(userId);
  const uniqueIds = [...new Set(candidateIds.map(String))];
  const candidates = await Candidate.find({ _id: { $in: uniqueIds }, companyId: company._id, isDeleted: false })
    .populate("jobId", "title department")
    .lean();

  if (candidates.length !== uniqueIds.length) {
    throw new ApiError(404, "One or more candidates were not found");
  }

  const jobIds = new Set(candidates.map((candidate) => String(candidate.jobId?._id || candidate.jobId)));
  if (jobIds.size !== 1) {
    throw new ApiError(400, "Candidates must belong to the same job for comparison");
  }

  return {
    notice: "Comparison is for recruiter review and does not make a hiring decision.",
    job: candidates[0].jobId
      ? {
          id: candidates[0].jobId._id.toString(),
          title: candidates[0].jobId.title,
          department: candidates[0].jobId.department
        }
      : null,
    candidates: candidates.map((candidate) => ({
      id: candidate._id.toString(),
      fullName: candidate.fullName,
      currentDesignation: candidate.currentDesignation,
      totalExperience: candidate.totalExperience,
      education: educationSummary(candidate.parsedResume),
      requiredSkillsFound: candidate.aiEvaluation?.requiredSkillsFound || [],
      requiredSkillsMissing: candidate.aiEvaluation?.requiredSkillsMissing || [],
      preferredSkillsFound: candidate.aiEvaluation?.preferredSkillsFound || [],
      overallScore: candidate.aiEvaluation?.overallScore ?? null,
      skillsScore: candidate.aiEvaluation?.skillsScore ?? null,
      experienceScore: candidate.aiEvaluation?.experienceScore ?? null,
      educationScore: candidate.aiEvaluation?.educationScore ?? null,
      projectScore: candidate.aiEvaluation?.projectScore ?? null,
      category: candidate.aiEvaluation?.category || null,
      strengths: candidate.aiEvaluation?.strengths || [],
      weaknesses: candidate.aiEvaluation?.weaknesses || [],
      relevantProjects: candidate.aiEvaluation?.projectAnalysis?.relevantProjects || [],
      status: candidate.status,
      resumeParseStatus: candidate.resumeParseStatus,
      aiScreeningStatus: candidate.aiScreeningStatus
    }))
  };
};

const csvEscape = (value) => {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

export const exportCandidatesForCompany = async (userId, query = {}) => {
  const { company } = await ensureUserCompany(userId);
  const filter = await buildCandidateFilter(company._id, query);
  if (query.candidateIds?.length) {
    filter._id = { $in: query.candidateIds };
  }
  const candidates = await Candidate.find(filter)
    .select("applicationId fullName email phone totalExperience currentCompany currentDesignation source status resumeParseStatus aiScreeningStatus aiEvaluation appliedAt jobId")
    .populate("jobId", "title")
    .sort(candidateSortMap[query.sort] || candidateSortMap.newest)
    .limit(5000)
    .lean();

  const headers = [
    "Application ID",
    "Candidate name",
    "Email",
    "Phone",
    "Job title",
    "Experience",
    "Current company",
    "Current designation",
    "Source",
    "Status",
    "Resume parse status",
    "AI screening status",
    "Overall score",
    "Category",
    "Applied date"
  ];

  const rows = candidates.map((candidate) => [
    candidate.applicationId,
    candidate.fullName,
    candidate.email,
    candidate.phone,
    candidate.jobId?.title || "",
    candidate.totalExperience,
    candidate.currentCompany,
    candidate.currentDesignation,
    candidate.source,
    candidate.status,
    candidate.resumeParseStatus,
    candidate.aiScreeningStatus,
    candidate.aiEvaluation?.overallScore ?? "",
    candidate.aiEvaluation?.category || "",
    candidate.appliedAt ? new Date(candidate.appliedAt).toISOString() : ""
  ]);

  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
  return { csv, count: candidates.length };
};

const AI_PROCESSING_STALE_MS = 15 * 60 * 1000;

const safeAiError = (message = "AI screening failed") =>
  String(message)
    .replace(/sk-[A-Za-z0-9_-]+/g, "[api-key]")
    .replace(/[A-Za-z]:\\[^\s)]+/g, "[path]")
    .slice(0, 500);

export const isAiEvaluationOutdated = (candidate, job = null) => {
  if (!candidate?.aiEvaluation || candidate.aiScreeningStatus !== "Screened") return false;

  const screenedJobUpdatedAt = candidate.jobUpdatedAtAtScreening ? new Date(candidate.jobUpdatedAtAtScreening) : null;
  const currentJobUpdatedAt = job?.updatedAt ? new Date(job.updatedAt) : null;
  const screenedResumeParsedAt = candidate.resumeParsedAtAtScreening ? new Date(candidate.resumeParsedAtAtScreening) : null;
  const currentResumeParsedAt = candidate.resumeParsedAt ? new Date(candidate.resumeParsedAt) : null;

  return Boolean(
    (screenedJobUpdatedAt && currentJobUpdatedAt && currentJobUpdatedAt > screenedJobUpdatedAt) ||
      (screenedResumeParsedAt && currentResumeParsedAt && currentResumeParsedAt > screenedResumeParsedAt)
  );
};

const getCandidateAndJobForScreening = async (userId, candidateId) => {
  const { company } = await ensureUserCompany(userId);
  const candidate = await Candidate.findOne({ _id: candidateId, companyId: company._id, isDeleted: false });

  if (!candidate) {
    throw new ApiError(404, "Candidate not found");
  }

  const job = await Job.findOne({ _id: candidate.jobId, companyId: company._id });

  if (!job) {
    throw new ApiError(404, "Job not found");
  }

  if (String(candidate.companyId) !== String(job.companyId)) {
    throw new ApiError(403, "Candidate and job company mismatch");
  }

  return { candidate, job };
};

const ensureCandidateReadyForScreening = (candidate) => {
  if (candidate.resumeParseStatus !== "Parsed" || !candidate.parsedResume) {
    throw new ApiError(422, "Resume has not been parsed");
  }
};

const acquireAiScreeningLock = async (userId, candidateId, force = false) => {
  const { company } = await ensureUserCompany(userId);
  const candidate = await Candidate.findOne({ _id: candidateId, companyId: company._id, isDeleted: false });

  if (!candidate) {
    throw new ApiError(404, "Candidate not found");
  }

  if (candidate.aiScreeningStatus === "Screened" && !force) {
    return { locked: false, candidate };
  }

  ensureCandidateReadyForScreening(candidate);

  const staleBefore = new Date(Date.now() - AI_PROCESSING_STALE_MS);
  if (candidate.aiScreeningStatus === "Processing" && candidate.updatedAt > staleBefore) {
    throw new ApiError(409, "AI screening is already in progress");
  }

  const lockedCandidate = await Candidate.findOneAndUpdate(
    {
      _id: candidateId,
      companyId: company._id,
      isDeleted: false,
      $or: [{ aiScreeningStatus: { $ne: "Processing" } }, { updatedAt: { $lte: staleBefore } }]
    },
    {
      $set: {
        aiScreeningStatus: "Processing",
        aiScreeningError: null
      },
      $inc: { aiScreeningAttempts: 1 }
    },
    { new: true }
  );

  if (!lockedCandidate) {
    throw new ApiError(409, "AI screening is already in progress");
  }

  return { locked: true, candidate: lockedCandidate };
};

const updateCandidateStatusAfterScreening = (candidate, user) => {
  if (candidate.status !== "Resume Parsed") return;

  candidate.statusHistory.push(
    buildStatusHistoryEntry({
      previousStatus: "Resume Parsed",
      newStatus: "AI Screening Completed",
      user,
      note: "AI screening completed"
    })
  );
  candidate.status = "AI Screening Completed";
};

const screeningPayload = (candidate, job = null) => ({
  candidateId: candidate._id.toString(),
  screeningStatus: candidate.aiScreeningStatus,
  screeningError: candidate.aiScreeningError,
  screenedAt: candidate.aiScreenedAt,
  screenedBy: candidate.aiScreenedBy,
  provider: candidate.aiProvider,
  model: candidate.aiModel,
  version: candidate.aiScreeningVersion,
  attempts: candidate.aiScreeningAttempts,
  fallbackUsed: candidate.aiProviderFallbackUsed,
  isOutdated: isAiEvaluationOutdated(candidate, job),
  evaluation: candidate.aiEvaluation
});

const updateAiScreeningFailure = async (candidateId, message) => {
  await Candidate.findByIdAndUpdate(candidateId, {
    $set: {
      aiScreeningStatus: "Failed",
      aiScreeningError: safeAiError(message)
    }
  });
};

export const screenCandidateForCompany = async (userId, candidateId, force = false) => {
  const { user } = await ensureUserCompany(userId);
  const { locked, candidate } = await acquireAiScreeningLock(userId, candidateId, force);

  if (!locked) {
    const job = await Job.findById(candidate.jobId);
    return screeningPayload(candidate, job);
  }

  try {
    const fresh = await Candidate.findById(candidate._id);
    const job = await Job.findOne({ _id: fresh.jobId, companyId: fresh.companyId });

    if (!job) {
      throw new ApiError(404, "Job not found");
    }

    ensureCandidateReadyForScreening(fresh);

    const scoreData = scoreCandidateForJob(job, fresh.parsedResume, fresh);
    const aiResult = await evaluateCandidateWithAI({ job, parsedResume: fresh.parsedResume, scoreData });

    fresh.aiEvaluation = aiResult.evaluation;
    fresh.aiScreeningStatus = "Screened";
    fresh.aiScreeningError = aiResult.safeWarning || null;
    fresh.aiScreenedAt = new Date();
    fresh.aiScreenedBy = user._id;
    fresh.aiProvider = aiResult.provider;
    fresh.aiModel = aiResult.model;
    fresh.aiScreeningVersion = AI_SCREENING_VERSION;
    fresh.aiProviderFallbackUsed = Boolean(aiResult.fallbackUsed);
    fresh.jobUpdatedAtAtScreening = job.updatedAt;
    fresh.resumeParsedAtAtScreening = fresh.resumeParsedAt;
    updateCandidateStatusAfterScreening(fresh, user);
    await fresh.save();

    return screeningPayload(fresh, job);
  } catch (error) {
    await updateAiScreeningFailure(candidate._id, error.message || "AI screening failed");
    throw error instanceof ApiError ? error : new ApiError(500, "AI screening failed");
  }
};

export const getCandidateAiEvaluationForCompany = async (userId, candidateId) => {
  const { candidate, job } = await getCandidateAndJobForScreening(userId, candidateId);
  return screeningPayload(candidate, job);
};

export const bulkScreenCandidatesForCompany = async (userId, candidateIds = [], force = false) => {
  const { company } = await ensureUserCompany(userId);
  const uniqueIds = [...new Set(candidateIds.map(String))];

  if (uniqueIds.length > 20) {
    throw new ApiError(400, "Bulk screening supports a maximum of 20 candidates");
  }

  const allowedCount = await Candidate.countDocuments({ _id: { $in: uniqueIds }, companyId: company._id, isDeleted: false });
  if (allowedCount !== uniqueIds.length) {
    throw new ApiError(403, "One or more candidates are not available for this company");
  }

  const results = [];

  for (const candidateId of uniqueIds) {
    try {
      const result = await screenCandidateForCompany(userId, candidateId, force);
      results.push({
        candidateId,
        success: true,
        score: result.evaluation?.overallScore ?? null,
        category: result.evaluation?.category ?? null,
        screeningStatus: result.screeningStatus
      });
    } catch (error) {
      results.push({
        candidateId,
        success: false,
        error: safeAiError(error.message || "AI screening failed")
      });
    }
  }

  return {
    total: results.length,
    successful: results.filter((item) => item.success).length,
    failed: results.filter((item) => !item.success).length,
    results
  };
};

export const getCandidateAiSummaryForCompany = async (userId) => {
  const { company } = await ensureUserCompany(userId);
  const [summary] = await Candidate.aggregate([
    { $match: { companyId: company._id, isDeleted: false } },
    {
      $group: {
        _id: null,
        totalCandidates: { $sum: 1 },
        screenedCandidates: { $sum: { $cond: [{ $eq: ["$aiScreeningStatus", "Screened"] }, 1, 0] } },
        notScreenedCandidates: { $sum: { $cond: [{ $ne: ["$aiScreeningStatus", "Screened"] }, 1, 0] } },
        averageScore: { $avg: "$aiEvaluation.overallScore" },
        excellentMatches: { $sum: { $cond: [{ $eq: ["$aiEvaluation.category", "Excellent Match"] }, 1, 0] } },
        goodMatches: { $sum: { $cond: [{ $eq: ["$aiEvaluation.category", "Good Match"] }, 1, 0] } },
        averageMatches: { $sum: { $cond: [{ $eq: ["$aiEvaluation.category", "Average Match"] }, 1, 0] } },
        lowMatches: { $sum: { $cond: [{ $eq: ["$aiEvaluation.category", "Low Match"] }, 1, 0] } },
        notSuitable: { $sum: { $cond: [{ $eq: ["$aiEvaluation.category", "Not Suitable"] }, 1, 0] } }
      }
    }
  ]);

  return {
    totalCandidates: summary?.totalCandidates || 0,
    screenedCandidates: summary?.screenedCandidates || 0,
    notScreenedCandidates: summary?.notScreenedCandidates || 0,
    averageScore: Math.round(summary?.averageScore || 0),
    excellentMatches: summary?.excellentMatches || 0,
    goodMatches: summary?.goodMatches || 0,
    averageMatches: summary?.averageMatches || 0,
    lowMatches: summary?.lowMatches || 0,
    notSuitable: summary?.notSuitable || 0,
    outdatedEvaluations: 0
  };
};

export const getCandidateSummaryForCompany = async (userId) => {
  const { company } = await ensureUserCompany(userId);
  const summary = await buildCandidateSummary(company._id, { companyId: company._id, isDeleted: false });

  return {
    ...summary,
    statusCounts: {
      Applied: summary.applied,
      "Resume Parsed": summary.resumeParsed,
      "AI Screening Completed": summary.aiScreened,
      "Under Review": summary.underReview,
      Shortlisted: summary.shortlisted,
      Rejected: summary.rejected,
      "On Hold": summary.onHold,
      Selected: summary.selected
    }
  };
};
