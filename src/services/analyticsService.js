import mongoose from "mongoose";
import { CANDIDATE_SOURCES, CANDIDATE_STATUSES } from "../models/Candidate.js";
import Candidate from "../models/Candidate.js";
import Company from "../models/Company.js";
import EmailLog from "../models/EmailLog.js";
import Interview from "../models/Interview.js";
import Job from "../models/Job.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import { ANALYTICS_EXPORT_ROW_LIMIT, SCORE_RANGES } from "../constants/analyticsConstants.js";
import { comparisonMetric, parseAnalyticsDateRange } from "../utils/analyticsDateRange.js";
import { generateAnalyticsInsights } from "./analyticsInsightService.js";

const objectId = (value) => new mongoose.Types.ObjectId(String(value));
const round = (value, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 0;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
};
const percent = (part, total) => (total ? round((Number(part || 0) / Number(total)) * 100, 2) : 0);
const avgMsToHours = (ms) => (ms ? round(ms / (1000 * 60 * 60), 2) : null);
const median = (values = []) => {
  const sorted = values.filter((value) => typeof value === "number" && !Number.isNaN(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : round((sorted[middle - 1] + sorted[middle]) / 2, 2);
};
const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizeSkill = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/\bnode\s*js\b/g, "node.js")
    .replace(/\breact\s*js\b/g, "react")
    .replace(/\bjavascript\b/g, "javascript")
    .replace(/\s+/g, " ")
    .replace(/^\W+|\W+$/g, "");
const displaySkill = (value = "") =>
  normalizeSkill(value)
    .split(" ")
    .map((part) => (part === "node.js" ? "Node.js" : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");

export const ensureAnalyticsCompany = async (userId) => {
  const user = await User.findById(userId);
  if (!user || user.role !== "hr") throw new ApiError(403, "Only HR users can access analytics");
  if (!user.companyId) throw new ApiError(403, "Company onboarding is required before using analytics");
  const company = await Company.findOne({ _id: user.companyId, isActive: true, accountStatus: { $ne: "Suspended" } });
  if (!company || company.accountStatus === "Disabled") throw new ApiError(403, "Company account is not active");
  return { user, company };
};

const validateAnalyticsFilters = async (companyId, query = {}) => {
  const filter = { companyId: objectId(companyId) };
  let allowedJobIds = null;
  if (query.jobId) {
    const job = await Job.findOne({ _id: query.jobId, companyId }).select("_id title department").lean();
    if (!job) throw new ApiError(404, "Job not found");
    allowedJobIds = [job._id];
  }
  if (query.department) {
    const jobs = await Job.find({ companyId, department: query.department }).select("_id").lean();
    const departmentIds = jobs.map((job) => String(job._id));
    allowedJobIds = allowedJobIds
      ? allowedJobIds.filter((id) => departmentIds.includes(String(id)))
      : jobs.map((job) => job._id);
  }
  if (allowedJobIds) filter.jobId = { $in: allowedJobIds };
  if (query.recruiterId) {
    const recruiter = await User.findOne({ _id: query.recruiterId, companyId, role: "hr" }).select("_id").lean();
    if (!recruiter) throw new ApiError(404, "Recruiter not found");
    filter.createdBy = objectId(query.recruiterId);
  }
  return filter;
};

const dateMatch = (field, range) => ({ [field]: { $gte: range.start, $lte: range.end } });
const previousRangeOrNull = (range) => range.comparePrevious ? range.previous : null;

const distribution = async (Model, match, field, allowed = null) => {
  const rows = await Model.aggregate([{ $match: match }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }, { $sort: { count: -1 } }]);
  const map = Object.fromEntries(rows.map((row) => [row._id || "Not available", row.count]));
  if (!allowed) return rows.map((row) => ({ label: row._id || "Not available", count: row.count }));
  return allowed.map((label) => ({ label, count: map[label] || 0 }));
};

const trend = async (Model, match, field, range, grouping = "day") => {
  const format = grouping === "month" ? "%Y-%m" : "%Y-%m-%d";
  const rows = await Model.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { date: `$${field}`, format, timezone: range.timezone } },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  return rows.map((row) => ({ label: row._id, count: row.count }));
};

const statusFirstDateExpression = (status) => ({
  $let: {
    vars: {
      matches: {
        $filter: {
          input: "$statusHistory",
          as: "history",
          cond: { $eq: ["$$history.newStatus", status] }
        }
      }
    },
    in: { $min: "$$matches.changedAt" }
  }
});

const timeMetric = async (companyId, baseMatch, status, targetField = null) => {
  const pipeline = [
    { $match: { ...baseMatch, companyId: objectId(companyId), isDeleted: false } },
    {
      $project: {
        appliedAt: 1,
        targetAt: targetField ? `$${targetField}` : statusFirstDateExpression(status)
      }
    },
    { $match: { targetAt: { $ne: null } } },
    { $project: { durationMs: { $subtract: ["$targetAt", "$appliedAt"] } } },
    { $match: { durationMs: { $gte: 0 } } },
    { $group: { _id: null, sampleSize: { $sum: 1 }, averageMs: { $avg: "$durationMs" }, values: { $push: "$durationMs" } } }
  ];
  const [row] = await Candidate.aggregate(pipeline);
  return {
    sampleSize: row?.sampleSize || 0,
    averageHours: avgMsToHours(row?.averageMs || null),
    medianHours: avgMsToHours(median(row?.values || []))
  };
};

const scoreDistributionPipeline = (match) => [
  { $match: { ...match, "aiEvaluation.overallScore": { $ne: null } } },
  {
    $bucket: {
      groupBy: "$aiEvaluation.overallScore",
      boundaries: [0, 30, 50, 70, 85, 101],
      default: "Unknown",
      output: { count: { $sum: 1 } }
    }
  }
];

const mapScoreDistribution = (rows) => {
  const labels = ["0-29", "30-49", "50-69", "70-84", "85-100"];
  const map = Object.fromEntries(rows.map((row, index) => [labels[index] || row._id, row.count]));
  return SCORE_RANGES.map((range) => ({ label: range.label, count: map[range.label] || 0 }));
};

const skillAggregate = async (companyId, sourceField, query, minOccurrence = 1) => {
  const base = await validateAnalyticsFilters(companyId, query);
  const range = parseAnalyticsDateRange(query);
  const rows = await Candidate.aggregate([
    { $match: { ...base, ...dateMatch("appliedAt", range), isDeleted: false } },
    { $project: { skills: `$${sourceField}` } },
    { $unwind: "$skills" },
    {
      $project: {
        skill: {
          $ifNull: ["$skills.skill", "$skills"]
        }
      }
    },
    { $match: { skill: { $nin: [null, ""] } } },
    { $group: { _id: { $toLower: "$skill" }, count: { $sum: 1 } } },
    { $match: { count: { $gte: minOccurrence } } },
    { $sort: { count: -1 } },
    { $limit: 20 }
  ]);
  const merged = new Map();
  rows.forEach((row) => {
    const key = normalizeSkill(row._id);
    if (!key) return;
    merged.set(key, (merged.get(key) || 0) + row.count);
  });
  return [...merged.entries()].map(([key, count]) => ({ skill: displaySkill(key), count })).sort((a, b) => b.count - a.count).slice(0, 20);
};

export const getAnalyticsSummary = async (userId, query = {}) => {
  const { company } = await ensureAnalyticsCompany(userId);
  const range = parseAnalyticsDateRange({ preset: "today", timezone: query.timezone }, company);
  const monthRange = parseAnalyticsDateRange({ preset: "this-month", timezone: range.timezone }, company);
  const now = new Date();
  const [applicationsToday, activeJobs, needsReview, interviewsToday, upcomingInterviews, interviewsNeedingFeedback, failedEmails, pendingEmails, ai, selectedThisMonth, totalCandidates, aiScreenedCandidates] = await Promise.all([
    Candidate.countDocuments({ companyId: company._id, isDeleted: false, ...dateMatch("appliedAt", range) }),
    Job.countDocuments({ companyId: company._id, status: "Active" }),
    Candidate.countDocuments({ companyId: company._id, isDeleted: false, status: { $in: ["Applied", "Resume Parsed", "AI Screening Completed", "Under Review"] } }),
    Interview.countDocuments({ companyId: company._id, ...dateMatch("startTime", range) }),
    Interview.countDocuments({ companyId: company._id, status: { $in: ["Scheduled", "Rescheduled", "In Progress"] }, startTime: { $gte: now } }),
    Interview.countDocuments({ companyId: company._id, status: "Completed", feedback: { $size: 0 } }),
    EmailLog.countDocuments({ companyId: company._id, status: "Failed" }),
    EmailLog.countDocuments({ companyId: company._id, status: "Pending" }),
    Candidate.aggregate([{ $match: { companyId: company._id, isDeleted: false, "aiEvaluation.overallScore": { $ne: null } } }, { $group: { _id: null, avg: { $avg: "$aiEvaluation.overallScore" } } }]),
    Candidate.countDocuments({ companyId: company._id, isDeleted: false, status: "Selected", updatedAt: { $gte: monthRange.start, $lte: monthRange.end } }),
    Candidate.countDocuments({ companyId: company._id, isDeleted: false }),
    Candidate.countDocuments({ companyId: company._id, isDeleted: false, aiScreeningStatus: "Screened" })
  ]);
  const selected = await Candidate.countDocuments({ companyId: company._id, isDeleted: false, status: "Selected" });
  const topInsight = generateAnalyticsInsights({
    overview: { newApplications: comparisonMetric(applicationsToday, null), emailDeliveryRate: comparisonMetric(0, null) },
    interviews: { interviewsMissingFeedback: interviewsNeedingFeedback },
    emails: { failed: failedEmails, failureRate: failedEmails ? 100 : 0 }
  })[0] || { severity: "info", message: "Analytics will become more useful as hiring activity grows." };

  return {
    range,
    totalCandidates,
    aiScreenedCandidates,
    applicationsToday,
    activeJobs,
    candidatesNeedingReview: needsReview,
    interviewsToday,
    upcomingInterviews,
    interviewsNeedingFeedback,
    emailsFailed: failedEmails,
    pendingEmails,
    averageAiScore: round(ai[0]?.avg || 0),
    selectedThisMonth,
    currentFunnelConversion: percent(selected, totalCandidates),
    topInsight
  };
};

export const getHiringFunnelAnalytics = async (userId, query = {}) => {
  const { company } = await ensureAnalyticsCompany(userId);
  const range = parseAnalyticsDateRange(query, company);
  const base = await validateAnalyticsFilters(company._id, query);
  const match = { ...base, isDeleted: false, ...dateMatch("appliedAt", range) };
  const totalApplications = await Candidate.countDocuments(match);
  const currentStatusDistribution = await distribution(Candidate, match, "status", CANDIDATE_STATUSES);
  const historicalRows = await Candidate.aggregate([
    { $match: match },
    { $unwind: "$statusHistory" },
    { $group: { _id: "$statusHistory.newStatus", count: { $addToSet: "$_id" } } },
    { $project: { _id: 1, count: { $size: "$count" } } }
  ]);
  const historicalMap = Object.fromEntries(historicalRows.map((row) => [row._id, row.count]));
  let previous = totalApplications;
  const historicalProgression = CANDIDATE_STATUSES.map((stage) => {
    const count = stage === "Applied" ? totalApplications : historicalMap[stage] || 0;
    const conversionFromPrevious = percent(count, previous);
    const item = {
      stage,
      count,
      percentageOfApplications: percent(count, totalApplications),
      conversionFromPrevious,
      dropOffFromPrevious: previous ? round(100 - conversionFromPrevious, 2) : 0
    };
    previous = count;
    return item;
  });
  const totalSelected = historicalMap.Selected || currentStatusDistribution.find((item) => item.label === "Selected")?.count || 0;
  return {
    range,
    totalApplications,
    totalSelected,
    overallConversionRate: percent(totalSelected, totalApplications),
    note: "Current-state distribution uses each candidate's current status. Historical progression uses statusHistory where available.",
    currentStatusDistribution,
    historicalProgression
  };
};

export const getCandidateSourcesAnalytics = async (userId, query = {}) => {
  const { company } = await ensureAnalyticsCompany(userId);
  const range = parseAnalyticsDateRange(query, company);
  const base = await validateAnalyticsFilters(company._id, query);
  const rows = await Candidate.aggregate([
    { $match: { ...base, isDeleted: false, ...dateMatch("appliedAt", range) } },
    {
      $group: {
        _id: "$source",
        applications: { $sum: 1 },
        parsedResumes: { $sum: { $cond: [{ $eq: ["$resumeParseStatus", "Parsed"] }, 1, 0] } },
        aiScreened: { $sum: { $cond: [{ $eq: ["$aiScreeningStatus", "Screened"] }, 1, 0] } },
        shortlisted: { $sum: { $cond: [{ $eq: ["$status", "Shortlisted"] }, 1, 0] } },
        interviewed: { $sum: { $cond: [{ $in: ["$status", ["Interview Scheduled", "Interview Completed", "Selected"]] }, 1, 0] } },
        selected: { $sum: { $cond: [{ $eq: ["$status", "Selected"] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ["$status", "Rejected"] }, 1, 0] } },
        averageAiScore: { $avg: "$aiEvaluation.overallScore" }
      }
    }
  ]);
  const bySource = Object.fromEntries(rows.map((row) => [row._id, row]));
  return {
    range,
    note: "Source analytics are operational summaries and do not imply source alone determines candidate quality.",
    sources: CANDIDATE_SOURCES.map((source) => {
      const row = bySource[source] || {};
      return {
        source,
        applications: row.applications || 0,
        parsedResumes: row.parsedResumes || 0,
        aiScreened: row.aiScreened || 0,
        shortlisted: row.shortlisted || 0,
        interviewed: row.interviewed || 0,
        selected: row.selected || 0,
        rejected: row.rejected || 0,
        selectionRate: percent(row.selected || 0, row.applications || 0),
        averageAiScore: round(row.averageAiScore || 0),
        averageTimeToShortlistHours: null
      };
    })
  };
};

export const getCandidateAnalytics = async (userId, query = {}) => {
  const { company } = await ensureAnalyticsCompany(userId);
  const range = parseAnalyticsDateRange(query, company);
  const base = await validateAnalyticsFilters(company._id, query);
  const match = { ...base, isDeleted: false, ...dateMatch("appliedAt", range) };
  const [total, appsTrend, statusDist, parseDist, aiDist, categoryDist, scoreRows, avgRows, experienceRows, sourceDist, locationRows, needsReview, outdated] = await Promise.all([
    Candidate.countDocuments(match),
    trend(Candidate, match, "appliedAt", range, query.grouping || "day"),
    distribution(Candidate, match, "status", CANDIDATE_STATUSES),
    distribution(Candidate, match, "resumeParseStatus"),
    distribution(Candidate, match, "aiScreeningStatus"),
    distribution(Candidate, match, "aiEvaluation.category"),
    Candidate.aggregate(scoreDistributionPipeline(match)),
    Candidate.aggregate([{ $match: match }, { $group: { _id: null, averageAiScore: { $avg: "$aiEvaluation.overallScore" } } }]),
    Candidate.aggregate([{ $match: match }, { $bucket: { groupBy: "$totalExperience", boundaries: [0, 2, 5, 8, 12, 61], default: "Unknown", output: { count: { $sum: 1 } } } }]),
    distribution(Candidate, match, "source", CANDIDATE_SOURCES),
    Candidate.aggregate([{ $match: match }, { $group: { _id: "$location", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]),
    Candidate.countDocuments({ ...match, status: { $in: ["Applied", "Resume Parsed", "AI Screening Completed", "Under Review"] } }),
    Candidate.countDocuments({ ...match, aiScreeningStatus: "Screened", $expr: { $or: [{ $gt: ["$updatedAt", "$aiScreenedAt"] }, { $gt: ["$resumeParsedAt", "$resumeParsedAtAtScreening"] }] } })
  ]);
  return {
    range,
    totalApplications: total,
    applicationsTrend: appsTrend,
    candidateStatusDistribution: statusDist,
    resumeParsingStatusDistribution: parseDist,
    aiScreeningStatusDistribution: aiDist,
    aiCategoryDistribution: categoryDist,
    averageAiScore: round(avgRows[0]?.averageAiScore || 0),
    scoreDistribution: mapScoreDistribution(scoreRows),
    topRequiredSkillsFound: await skillAggregate(company._id, "aiEvaluation.requiredSkillsFound", query),
    topMissingRequiredSkills: await skillAggregate(company._id, "aiEvaluation.requiredSkillsMissing", query),
    candidateExperienceDistribution: ["0-1", "2-4", "5-7", "8-11", "12+"].map((label, index) => ({ label, count: experienceRows[index]?.count || 0 })),
    candidateSourceDistribution: sourceDist,
    applicationsByLocation: locationRows.map((row) => ({ location: row._id || "Not available", count: row.count })),
    candidatesNeedingRecruiterReview: needsReview,
    candidatesWithOutdatedAiEvaluations: outdated
  };
};

export const getAiScreeningAnalytics = async (userId, query = {}) => {
  const { company } = await ensureAnalyticsCompany(userId);
  const range = parseAnalyticsDateRange(query, company);
  const base = await validateAnalyticsFilters(company._id, query);
  const match = { ...base, isDeleted: false, ...dateMatch("appliedAt", range) };
  const screenedMatch = { ...match, aiScreeningStatus: "Screened" };
  const [total, screened, avgRows, scoreRows, categoryDist, providerDist, failed, outdated, attemptsRows, scores] = await Promise.all([
    Candidate.countDocuments(match),
    Candidate.countDocuments(screenedMatch),
    Candidate.aggregate([{ $match: screenedMatch }, { $group: { _id: null, averageScore: { $avg: "$aiEvaluation.overallScore" }, averageAttempts: { $avg: "$aiScreeningAttempts" } } }]),
    Candidate.aggregate(scoreDistributionPipeline(screenedMatch)),
    distribution(Candidate, screenedMatch, "aiEvaluation.category"),
    distribution(Candidate, match, "aiProvider"),
    Candidate.countDocuments({ ...match, aiScreeningStatus: "Failed" }),
    Candidate.countDocuments({ ...screenedMatch, $expr: { $gt: ["$updatedAt", "$aiScreenedAt"] } }),
    Candidate.aggregate([{ $match: match }, { $group: { _id: null, attempts: { $avg: "$aiScreeningAttempts" } } }]),
    Candidate.find(screenedMatch).select("aiEvaluation.overallScore").lean()
  ]);
  return {
    range,
    totalScreenedCandidates: screened,
    screeningCompletionRate: percent(screened, total),
    averageScore: round(avgRows[0]?.averageScore || 0),
    medianScore: median(scores.map((item) => item.aiEvaluation?.overallScore)),
    scoreDistribution: mapScoreDistribution(scoreRows),
    categoryDistribution: categoryDist,
    averageScoreByJob: await getAverageScoreByJob(company._id, match),
    averageScoreByDepartment: await getAverageScoreByDepartment(company._id, match),
    requiredSkillsMostOftenFound: await skillAggregate(company._id, "aiEvaluation.requiredSkillsFound", query),
    requiredSkillsMostOftenMissing: await skillAggregate(company._id, "aiEvaluation.requiredSkillsMissing", query),
    failedScreenings: failed,
    outdatedScreenings: outdated,
    providerDistribution: providerDist,
    averageScreeningAttempts: round(avgRows[0]?.averageAttempts || attemptsRows[0]?.attempts || 0),
    averageTimeFromParsingToScreeningHours: await averageParsingToScreening(company._id, match)
  };
};

const getAverageScoreByJob = async (companyId, match) => {
  const rows = await Candidate.aggregate([
    { $match: { ...match, "aiEvaluation.overallScore": { $ne: null } } },
    { $group: { _id: "$jobId", averageScore: { $avg: "$aiEvaluation.overallScore" }, screened: { $sum: 1 } } },
    { $lookup: { from: "jobs", localField: "_id", foreignField: "_id", as: "job" } },
    { $unwind: "$job" },
    { $match: { "job.companyId": objectId(companyId) } },
    { $project: { jobId: "$_id", title: "$job.title", averageScore: 1, screened: 1 } },
    { $sort: { averageScore: -1 } },
    { $limit: 10 }
  ]);
  return rows.map((row) => ({ jobId: row.jobId, title: row.title, averageScore: round(row.averageScore), screened: row.screened }));
};

const getAverageScoreByDepartment = async (companyId, match) => {
  const rows = await Candidate.aggregate([
    { $match: { ...match, "aiEvaluation.overallScore": { $ne: null } } },
    { $lookup: { from: "jobs", localField: "jobId", foreignField: "_id", as: "job" } },
    { $unwind: "$job" },
    { $match: { "job.companyId": objectId(companyId) } },
    { $group: { _id: "$job.department", averageScore: { $avg: "$aiEvaluation.overallScore" }, screened: { $sum: 1 } } },
    { $sort: { averageScore: -1 } }
  ]);
  return rows.map((row) => ({ department: row._id || "Not available", averageScore: round(row.averageScore), screened: row.screened }));
};

const averageParsingToScreening = async (_companyId, match) => {
  const [row] = await Candidate.aggregate([
    { $match: { ...match, resumeParsedAt: { $ne: null }, aiScreenedAt: { $ne: null } } },
    { $project: { durationMs: { $subtract: ["$aiScreenedAt", "$resumeParsedAt"] } } },
    { $match: { durationMs: { $gte: 0 } } },
    { $group: { _id: null, averageMs: { $avg: "$durationMs" }, sampleSize: { $sum: 1 } } }
  ]);
  return { sampleSize: row?.sampleSize || 0, averageHours: avgMsToHours(row?.averageMs || null) };
};

export const getSkillAnalytics = async (userId, query = {}) => {
  const { company } = await ensureAnalyticsCompany(userId);
  const minOccurrence = Number(query.minOccurrence || 1);
  const jobs = await Job.find({
    companyId: company._id,
    ...(query.jobId ? { _id: query.jobId } : {}),
    ...(query.department ? { department: query.department } : {})
  }).select("requiredSkills preferredSkills").lean();
  const demand = new Map();
  jobs.flatMap((job) => job.requiredSkills || []).forEach((skill) => {
    const key = normalizeSkill(skill);
    if (key) demand.set(key, (demand.get(key) || 0) + 1);
  });
  const requested = [...demand.entries()]
    .filter(([, count]) => count >= minOccurrence)
    .map(([key, count]) => ({ skill: displaySkill(key), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
  const available = await skillAggregate(company._id, "parsedResume.skills", query, minOccurrence);
  const missing = await skillAggregate(company._id, "aiEvaluation.requiredSkillsMissing", query, minOccurrence);
  const preferred = await skillAggregate(company._id, "aiEvaluation.preferredSkillsFound", query, minOccurrence);
  const availableMap = new Map(available.map((item) => [normalizeSkill(item.skill), item.count]));
  return {
    range: parseAnalyticsDateRange(query, company),
    mostRequestedSkills: requested,
    mostCommonlyFoundCandidateSkills: available,
    mostCommonlyMissingRequiredSkills: missing,
    preferredSkillsFound: preferred,
    demandVersusAvailability: requested.map((item) => {
      const availableCount = availableMap.get(normalizeSkill(item.skill)) || 0;
      return {
        skill: item.skill,
        requested: item.count,
        available: availableCount,
        skillGapPercentage: item.count ? round(Math.max(item.count - availableCount, 0) / item.count * 100, 2) : 0
      };
    })
  };
};

export const getJobAnalytics = async (userId, query = {}) => {
  const { company } = await ensureAnalyticsCompany(userId);
  const range = parseAnalyticsDateRange(query, company);
  const page = Number(query.page || 1);
  const limit = Math.min(Number(query.limit || 10), 100);
  const jobFilter = { companyId: company._id };
  if (query.department) jobFilter.department = query.department;
  if (query.status) jobFilter.status = query.status;
  if (query.search) jobFilter.title = new RegExp(escapeRegex(query.search), "i");
  const sort = query.sort === "oldest" ? { createdAt: 1 } : { createdAt: -1 };
  const [jobs, total] = await Promise.all([
    Job.find(jobFilter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    Job.countDocuments(jobFilter)
  ]);
  const jobIds = jobs.map((job) => job._id);
  const candidateRows = await Candidate.aggregate([
    { $match: { companyId: company._id, jobId: { $in: jobIds }, isDeleted: false } },
    {
      $group: {
        _id: "$jobId",
        totalApplications: { $sum: 1 },
        applicationsInRange: { $sum: { $cond: [{ $and: [{ $gte: ["$appliedAt", range.start] }, { $lte: ["$appliedAt", range.end] }] }, 1, 0] } },
        parsedResumes: { $sum: { $cond: [{ $eq: ["$resumeParseStatus", "Parsed"] }, 1, 0] } },
        aiScreenedCandidates: { $sum: { $cond: [{ $eq: ["$aiScreeningStatus", "Screened"] }, 1, 0] } },
        averageAiScore: { $avg: "$aiEvaluation.overallScore" },
        shortlisted: { $sum: { $cond: [{ $eq: ["$status", "Shortlisted"] }, 1, 0] } },
        selected: { $sum: { $cond: [{ $eq: ["$status", "Selected"] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ["$status", "Rejected"] }, 1, 0] } },
        onHold: { $sum: { $cond: [{ $eq: ["$status", "On Hold"] }, 1, 0] } },
        firstApplicationAt: { $min: "$appliedAt" }
      }
    }
  ]);
  const interviewRows = await Interview.aggregate([
    { $match: { companyId: company._id, jobId: { $in: jobIds } } },
    { $group: { _id: "$jobId", interviews: { $sum: 1 }, completedInterviews: { $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] } } } }
  ]);
  const emailRows = await EmailLog.aggregate([
    { $match: { companyId: company._id, jobId: { $in: jobIds } } },
    { $group: { _id: "$jobId", sent: { $sum: { $cond: [{ $eq: ["$status", "Sent"] }, 1, 0] } }, failed: { $sum: { $cond: [{ $eq: ["$status", "Failed"] }, 1, 0] } } } }
  ]);
  const byJob = Object.fromEntries(candidateRows.map((row) => [String(row._id), row]));
  const byInterview = Object.fromEntries(interviewRows.map((row) => [String(row._id), row]));
  const byEmail = Object.fromEntries(emailRows.map((row) => [String(row._id), row]));
  let data = jobs.map((job) => {
    const row = byJob[String(job._id)] || {};
    const interviews = byInterview[String(job._id)] || {};
    const emails = byEmail[String(job._id)] || {};
    return {
      jobId: job._id.toString(),
      title: job.title,
      department: job.department,
      status: job.status,
      createdAt: job.createdAt,
      totalApplications: row.totalApplications || 0,
      applicationsInRange: row.applicationsInRange || 0,
      parsedResumes: row.parsedResumes || 0,
      aiScreenedCandidates: row.aiScreenedCandidates || 0,
      averageAiScore: round(row.averageAiScore || 0),
      shortlisted: row.shortlisted || 0,
      interviews: interviews.interviews || 0,
      completedInterviews: interviews.completedInterviews || 0,
      selected: row.selected || 0,
      rejected: row.rejected || 0,
      onHold: row.onHold || 0,
      applicationToShortlistRate: percent(row.shortlisted || 0, row.totalApplications || 0),
      shortlistToInterviewRate: percent(interviews.interviews || 0, row.shortlisted || 0),
      interviewToSelectionRate: percent(row.selected || 0, interviews.completedInterviews || 0),
      timeToFirstApplicationHours: row.firstApplicationAt ? avgMsToHours(new Date(row.firstApplicationAt) - new Date(job.createdAt)) : null,
      averageTimeToShortlistHours: null,
      averageTimeToHireHours: null,
      emailDeliveryRate: percent(emails.sent || 0, (emails.sent || 0) + (emails.failed || 0))
    };
  });
  const sorters = {
    "most-applications": (a, b) => b.totalApplications - a.totalApplications,
    "least-applications": (a, b) => a.totalApplications - b.totalApplications,
    "highest-selection-rate": (a, b) => b.interviewToSelectionRate - a.interviewToSelectionRate,
    "lowest-selection-rate": (a, b) => a.interviewToSelectionRate - b.interviewToSelectionRate,
    "highest-average-score": (a, b) => b.averageAiScore - a.averageAiScore,
    "fastest-time-to-hire": (a, b) => (a.averageTimeToHireHours || Number.MAX_SAFE_INTEGER) - (b.averageTimeToHireHours || Number.MAX_SAFE_INTEGER)
  };
  if (sorters[query.sort]) data = data.sort(sorters[query.sort]);
  return { range, jobs: data, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } };
};

export const getJobAnalyticsDetails = async (userId, jobId, query = {}) => {
  const { company } = await ensureAnalyticsCompany(userId);
  const job = await Job.findOne({ _id: jobId, companyId: company._id }).lean();
  if (!job) throw new ApiError(404, "Job not found");
  const range = parseAnalyticsDateRange(query, company);
  const base = { companyId: company._id, jobId: objectId(jobId), isDeleted: false };
  const candidateAnalytics = await getCandidateAnalytics(userId, { ...query, jobId });
  const interviews = await getInterviewAnalytics(userId, { ...query, jobId });
  const emails = await getEmailAnalytics(userId, { ...query, jobId });
  const topCandidates = await Candidate.find({ ...base, aiScreeningStatus: "Screened" })
    .select("applicationId status totalExperience aiEvaluation.overallScore aiEvaluation.category")
    .sort({ "aiEvaluation.overallScore": -1 })
    .limit(5)
    .lean();
  return {
    range,
    job: { id: job._id.toString(), title: job.title, department: job.department, status: job.status, createdAt: job.createdAt },
    applicationsTrend: candidateAnalytics.applicationsTrend,
    candidateSourceDistribution: candidateAnalytics.candidateSourceDistribution,
    candidateStatusFunnel: await getHiringFunnelAnalytics(userId, { ...query, jobId }),
    aiScoreDistribution: candidateAnalytics.scoreDistribution,
    requiredSkillsFound: candidateAnalytics.topRequiredSkillsFound,
    missingSkills: candidateAnalytics.topMissingRequiredSkills,
    interviewPerformance: interviews,
    emailPerformance: emails,
    conversionMetrics: {
      applicationToSelectionRate: percent(await Candidate.countDocuments({ ...base, status: "Selected" }), await Candidate.countDocuments(base))
    },
    timeBasedMetrics: {
      timeToScreen: await timeMetric(company._id, { jobId: objectId(jobId) }, null, "aiScreenedAt"),
      timeToInterview: await timeMetric(company._id, { jobId: objectId(jobId) }, "Interview Scheduled"),
      timeToHire: await timeMetric(company._id, { jobId: objectId(jobId) }, "Selected")
    },
    topCandidateSummary: topCandidates.map((candidate) => ({
      applicationId: candidate.applicationId,
      status: candidate.status,
      totalExperience: candidate.totalExperience,
      overallScore: candidate.aiEvaluation?.overallScore ?? null,
      category: candidate.aiEvaluation?.category || null
    }))
  };
};

export const getInterviewAnalytics = async (userId, query = {}) => {
  const { company } = await ensureAnalyticsCompany(userId);
  const range = parseAnalyticsDateRange(query, company);
  const base = await validateAnalyticsFilters(company._id, query);
  delete base.createdBy;
  const match = { ...base, ...dateMatch("startTime", range) };
  const [statusRows, avgRows, typeDist, modeDist, roundDist, interviewTrend, recDist, missingFeedback, totalCandidates, interviewedCandidates] = await Promise.all([
    Interview.aggregate([{ $match: match }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Interview.aggregate([{ $match: match }, { $group: { _id: null, averageRating: { $avg: "$overallRating" }, averageDuration: { $avg: "$durationMinutes" }, total: { $sum: 1 }, withFeedback: { $sum: { $cond: [{ $gt: [{ $size: "$feedback" }, 0] }, 1, 0] } } } }]),
    distribution(Interview, match, "interviewType"),
    distribution(Interview, match, "interviewMode"),
    distribution(Interview, match, "interviewRound"),
    trend(Interview, match, "startTime", range, query.grouping || "day"),
    distribution(Interview, match, "recommendation"),
    Interview.countDocuments({ ...match, status: "Completed", feedback: { $size: 0 } }),
    Candidate.countDocuments({ companyId: company._id, isDeleted: false }),
    Interview.distinct("candidateId", match).then((ids) => ids.length)
  ]);
  const byStatus = Object.fromEntries(statusRows.map((row) => [row._id, row.count]));
  const total = avgRows[0]?.total || 0;
  return {
    range,
    totalScheduled: total,
    rescheduled: byStatus.Rescheduled || 0,
    completed: byStatus.Completed || 0,
    cancelled: byStatus.Cancelled || 0,
    noShow: byStatus["No Show"] || 0,
    inProgress: byStatus["In Progress"] || 0,
    completionRate: percent(byStatus.Completed || 0, total),
    cancellationRate: percent(byStatus.Cancelled || 0, total),
    noShowRate: percent(byStatus["No Show"] || 0, total),
    averageRating: round(avgRows[0]?.averageRating || 0),
    averageInterviewDurationMinutes: round(avgRows[0]?.averageDuration || 0),
    interviewsByType: typeDist,
    interviewsByMode: modeDist,
    interviewsByRound: roundDist,
    interviewsTrend: interviewTrend,
    averageTimeFromShortlistToInterview: await timeMetric(company._id, {}, "Interview Scheduled"),
    recommendationsDistribution: recDist,
    feedbackSubmissionRate: percent(avgRows[0]?.withFeedback || 0, total),
    interviewsMissingFeedback: missingFeedback,
    candidateToInterviewConversion: percent(interviewedCandidates, totalCandidates)
  };
};

export const getInterviewerAnalytics = async (userId, query = {}) => {
  const { company } = await ensureAnalyticsCompany(userId);
  const range = parseAnalyticsDateRange(query, company);
  const match = { companyId: company._id, ...dateMatch("startTime", range) };
  const rows = await Interview.aggregate([
    { $match: match },
    { $unwind: "$interviewers" },
    {
      $group: {
        _id: "$interviewers.userId",
        name: { $first: "$interviewers.name" },
        role: { $first: "$interviewers.role" },
        totalAssignedInterviews: { $sum: 1 },
        completedInterviews: { $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] } },
        cancelledInterviews: { $sum: { $cond: [{ $eq: ["$status", "Cancelled"] }, 1, 0] } },
        upcomingInterviewCount: { $sum: { $cond: [{ $gt: ["$startTime", new Date()] }, 1, 0] } },
        averageCandidateRating: { $avg: "$overallRating" },
        feedbackSubmitted: { $sum: { $size: "$feedback" } },
        strongHireRecommendations: { $sum: { $cond: [{ $eq: ["$recommendation", "Strong Hire"] }, 1, 0] } },
        hireRecommendations: { $sum: { $cond: [{ $eq: ["$recommendation", "Hire"] }, 1, 0] } },
        furtherReviewRecommendations: { $sum: { $cond: [{ $eq: ["$recommendation", "Further Review"] }, 1, 0] } },
        noHireRecommendations: { $sum: { $cond: [{ $in: ["$recommendation", ["No Hire", "Strong No Hire"]] }, 1, 0] } }
      }
    },
    { $sort: { totalAssignedInterviews: -1 } }
  ]);
  return {
    range,
    note: "Interviewer analytics summarize operational activity and should not be used as the sole measure of employee performance.",
    interviewers: rows.map((row) => ({
      interviewerId: row._id,
      name: row.name,
      role: row.role,
      totalAssignedInterviews: row.totalAssignedInterviews,
      completedInterviews: row.completedInterviews,
      cancelledInterviews: row.cancelledInterviews,
      feedbackSubmitted: row.feedbackSubmitted,
      feedbackSubmissionRate: percent(row.feedbackSubmitted, row.completedInterviews),
      averageRatingGiven: round(row.averageCandidateRating || 0),
      averageCandidateRating: round(row.averageCandidateRating || 0),
      strongHireRecommendations: row.strongHireRecommendations,
      hireRecommendations: row.hireRecommendations,
      furtherReviewRecommendations: row.furtherReviewRecommendations,
      noHireRecommendations: row.noHireRecommendations,
      upcomingInterviewCount: row.upcomingInterviewCount,
      averageFeedbackDelayHours: null
    }))
  };
};

export const getEmailAnalytics = async (userId, query = {}) => {
  const { company } = await ensureAnalyticsCompany(userId);
  const range = parseAnalyticsDateRange(query, company);
  const base = { companyId: company._id, ...dateMatch("createdAt", range) };
  if (query.jobId) {
    const job = await Job.findOne({ _id: query.jobId, companyId: company._id }).select("_id").lean();
    if (!job) throw new ApiError(404, "Job not found");
    base.jobId = objectId(query.jobId);
  }
  const [statusRows, typeDist, providerDist, emailTrend, attemptsRows, failureRows, overdue] = await Promise.all([
    EmailLog.aggregate([{ $match: base }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    distribution(EmailLog, base, "emailType"),
    distribution(EmailLog, base, "provider"),
    trend(EmailLog, base, "createdAt", range, query.grouping || "day"),
    EmailLog.aggregate([{ $match: base }, { $group: { _id: null, averageAttempts: { $avg: "$attempts" }, total: { $sum: 1 } } }]),
    EmailLog.aggregate([{ $match: { ...base, status: "Failed" } }, { $group: { _id: "$errorCode", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 8 }]),
    EmailLog.countDocuments({ companyId: company._id, status: "Pending", scheduledFor: { $lt: new Date() } })
  ]);
  const byStatus = Object.fromEntries(statusRows.map((row) => [row._id, row.count]));
  const sent = byStatus.Sent || 0;
  const failed = byStatus.Failed || 0;
  const total = attemptsRows[0]?.total || 0;
  const deliveryByType = (type) => {
    const all = typeDist.find((item) => item.label === type)?.count || 0;
    return all ? percent(sent, total) : 0;
  };
  return {
    range,
    totalEmails: total,
    sent,
    failed,
    pending: byStatus.Pending || 0,
    processing: byStatus.Processing || 0,
    skipped: byStatus.Skipped || 0,
    deliveryRate: percent(sent, sent + failed),
    failureRate: percent(failed, sent + failed),
    retrySuccessRate: 0,
    emailsByType: typeDist,
    emailsByProvider: providerDist,
    emailsTrend: emailTrend,
    interviewInvitationDeliveryRate: deliveryByType("Interview Invitation"),
    reminderDeliveryRate: deliveryByType("Interview Reminder"),
    candidateStatusEmailDeliveryRate: percent(
      typeDist.filter((item) => ["Shortlisted", "Rejected", "Selected", "On Hold"].includes(item.label)).reduce((sum, item) => sum + item.count, 0),
      total
    ),
    topFailureReasons: failureRows.map((row) => ({ reason: row._id || "Unknown", count: row.count })),
    averageAttempts: round(attemptsRows[0]?.averageAttempts || 0),
    pendingEmailsOverdueForProcessing: overdue
  };
};

export const getRecruiterAnalytics = async (userId, query = {}) => {
  const { company } = await ensureAnalyticsCompany(userId);
  const range = parseAnalyticsDateRange(query, company);
  const users = await User.find({ companyId: company._id, role: "hr" }).select("name email role createdAt lastLoginAt").lean();
  const ids = users.map((user) => user._id);
  const [statusRows, noteRows, interviewRows, feedbackRows, emailRows, jobRows] = await Promise.all([
    Candidate.aggregate([{ $match: { companyId: company._id, "statusHistory.changedBy": { $in: ids } } }, { $unwind: "$statusHistory" }, { $match: { "statusHistory.changedBy": { $in: ids }, "statusHistory.changedAt": { $gte: range.start, $lte: range.end } } }, { $group: { _id: "$statusHistory.changedBy", statusChanges: { $sum: 1 }, lastActivity: { $max: "$statusHistory.changedAt" } } }]),
    Candidate.aggregate([{ $match: { companyId: company._id, "recruiterNotes.createdBy": { $in: ids } } }, { $unwind: "$recruiterNotes" }, { $match: { "recruiterNotes.createdBy": { $in: ids }, "recruiterNotes.createdAt": { $gte: range.start, $lte: range.end } } }, { $group: { _id: "$recruiterNotes.createdBy", notesAdded: { $sum: 1 }, lastActivity: { $max: "$recruiterNotes.createdAt" } } }]),
    Interview.aggregate([{ $match: { companyId: company._id, createdBy: { $in: ids }, createdAt: { $gte: range.start, $lte: range.end } } }, { $group: { _id: "$createdBy", interviewsScheduled: { $sum: 1 }, lastActivity: { $max: "$createdAt" } } }]),
    Interview.aggregate([{ $match: { companyId: company._id } }, { $unwind: "$feedback" }, { $match: { "feedback.interviewerId": { $in: ids }, "feedback.submittedAt": { $gte: range.start, $lte: range.end } } }, { $group: { _id: "$feedback.interviewerId", feedbackSubmitted: { $sum: 1 }, lastActivity: { $max: "$feedback.submittedAt" } } }]),
    EmailLog.aggregate([{ $match: { companyId: company._id, triggeredBy: { $in: ids }, createdAt: { $gte: range.start, $lte: range.end } } }, { $group: { _id: "$triggeredBy", emailsSent: { $sum: 1 }, lastActivity: { $max: "$createdAt" } } }]),
    Job.aggregate([{ $match: { companyId: company._id, createdBy: { $in: ids }, createdAt: { $gte: range.start, $lte: range.end } } }, { $group: { _id: "$createdBy", jobsCreated: { $sum: 1 }, lastActivity: { $max: "$createdAt" } } }])
  ]);
  const rows = [statusRows, noteRows, interviewRows, feedbackRows, emailRows, jobRows].flat();
  const byUser = (rowsForMetric, key) => Object.fromEntries(rowsForMetric.map((row) => [String(row._id), row[key] || 0]));
  const lastMap = new Map();
  rows.forEach((row) => {
    const current = lastMap.get(String(row._id));
    if (!current || new Date(row.lastActivity) > new Date(current)) lastMap.set(String(row._id), row.lastActivity);
  });
  return {
    range,
    notice: "These metrics summarize activity inside HireSmart AI and should not be used as the sole measure of employee performance.",
    recruiters: users.map((user) => ({
      recruiterId: user._id.toString(),
      name: user.name,
      role: user.role,
      candidatesReviewed: byUser(statusRows, "statusChanges")[String(user._id)] || 0,
      statusChanges: byUser(statusRows, "statusChanges")[String(user._id)] || 0,
      notesAdded: byUser(noteRows, "notesAdded")[String(user._id)] || 0,
      interviewsScheduled: byUser(interviewRows, "interviewsScheduled")[String(user._id)] || 0,
      feedbackSubmitted: byUser(feedbackRows, "feedbackSubmitted")[String(user._id)] || 0,
      emailsSent: byUser(emailRows, "emailsSent")[String(user._id)] || 0,
      jobsCreated: byUser(jobRows, "jobsCreated")[String(user._id)] || 0,
      averageCandidateResponseTimeHours: null,
      lastActivityDate: lastMap.get(String(user._id)) || user.lastLoginAt || user.createdAt
    }))
  };
};

export const getAnalyticsOverview = async (userId, query = {}) => {
  const { company } = await ensureAnalyticsCompany(userId);
  const range = parseAnalyticsDateRange(query, company);
  const base = await validateAnalyticsFilters(company._id, query);
  const match = { ...base, isDeleted: false, ...dateMatch("appliedAt", range) };
  const previous = previousRangeOrNull(range);
  const previousMatch = previous ? { ...base, isDeleted: false, appliedAt: { $gte: previous.start, $lte: previous.end } } : null;
  const [currentCount, previousCount, activeJobs, shortlisted, scheduled, completed, selected, rejected, avgAi, avgRating, emailAnalytics, funnel, candidateSources, appsTrend, interviewsTrend, selectionTrend, jobs, skills, recruiterActivity] = await Promise.all([
    Candidate.countDocuments(match),
    previousMatch ? Candidate.countDocuments(previousMatch) : Promise.resolve(null),
    Job.countDocuments({ companyId: company._id, status: "Active" }),
    Candidate.countDocuments({ ...match, status: "Shortlisted" }),
    Interview.countDocuments({ companyId: company._id, ...dateMatch("startTime", range) }),
    Interview.countDocuments({ companyId: company._id, status: "Completed", ...dateMatch("startTime", range) }),
    Candidate.countDocuments({ ...match, status: "Selected" }),
    Candidate.countDocuments({ ...match, status: "Rejected" }),
    Candidate.aggregate([{ $match: match }, { $group: { _id: null, avg: { $avg: "$aiEvaluation.overallScore" } } }]),
    Interview.aggregate([{ $match: { companyId: company._id, ...dateMatch("startTime", range), overallRating: { $ne: null } } }, { $group: { _id: null, avg: { $avg: "$overallRating" } } }]),
    getEmailAnalytics(userId, query),
    getHiringFunnelAnalytics(userId, query),
    getCandidateSourcesAnalytics(userId, query),
    trend(Candidate, match, "appliedAt", range, query.grouping || "day"),
    trend(Interview, { companyId: company._id, ...dateMatch("startTime", range) }, "startTime", range, query.grouping || "day"),
    trend(Candidate, { ...match, status: "Selected" }, "updatedAt", range, query.grouping || "day"),
    getJobAnalytics(userId, { ...query, limit: 5, sort: "most-applications" }),
    getSkillAnalytics(userId, query),
    getRecruiterAnalytics(userId, query)
  ]);
  const overview = {
    range,
    totalCandidates: comparisonMetric(await Candidate.countDocuments({ companyId: company._id, isDeleted: false }), null),
    newApplications: comparisonMetric(currentCount, previousCount),
    activeJobs: comparisonMetric(activeJobs, null),
    shortlistedCandidates: comparisonMetric(shortlisted, null),
    interviewsScheduled: comparisonMetric(scheduled, null),
    interviewsCompleted: comparisonMetric(completed, null),
    selectedCandidates: comparisonMetric(selected, null),
    rejectedCandidates: comparisonMetric(rejected, null),
    averageAiScore: comparisonMetric(round(avgAi[0]?.avg || 0), null),
    averageInterviewRating: comparisonMetric(round(avgRating[0]?.avg || 0), null),
    emailsSent: comparisonMetric(emailAnalytics.sent, null),
    emailDeliveryRate: comparisonMetric(emailAnalytics.deliveryRate, null),
    timeToScreen: await timeMetric(company._id, {}, null, "aiScreenedAt"),
    timeToInterview: await timeMetric(company._id, {}, "Interview Scheduled"),
    timeToHire: await timeMetric(company._id, {}, "Selected"),
    hiringFunnel: funnel,
    candidateSourceDistribution: candidateSources.sources,
    candidateStatusDistribution: funnel.currentStatusDistribution,
    applicationsTrend: appsTrend,
    interviewsTrend,
    selectionTrend,
    topPerformingJobs: jobs.jobs,
    recruiterActivitySummary: recruiterActivity.recruiters.slice(0, 5)
  };
  overview.insights = generateAnalyticsInsights({ overview, skills, interviews: await getInterviewAnalytics(userId, query), jobs, emails: emailAnalytics });
  overview.recentActivitySummary = overview.insights;
  return overview;
};

const csvEscape = (value) => {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

const toCsv = (headers, rows) => [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");

export const exportAnalyticsReport = async (userId, query = {}) => {
  const reportType = query.reportType || "overview";
  const dataByType = {
    overview: () => getAnalyticsOverview(userId, query),
    "hiring-funnel": () => getHiringFunnelAnalytics(userId, query),
    candidates: () => getCandidateAnalytics(userId, query),
    jobs: () => getJobAnalytics(userId, { ...query, limit: Math.min(Number(query.limit || ANALYTICS_EXPORT_ROW_LIMIT), ANALYTICS_EXPORT_ROW_LIMIT) }),
    interviews: () => getInterviewAnalytics(userId, query),
    interviewers: () => getInterviewerAnalytics(userId, query),
    emails: () => getEmailAnalytics(userId, query),
    recruiters: () => getRecruiterAnalytics(userId, query),
    skills: () => getSkillAnalytics(userId, query)
  };
  if (!dataByType[reportType]) throw new ApiError(400, "Invalid report type");
  const data = await dataByType[reportType]();
  let headers = ["Metric", "Value"];
  let rows = [];
  if (reportType === "jobs") {
    headers = ["Job ID", "Title", "Department", "Status", "Applications", "Selected", "Average AI Score", "Email Delivery Rate"];
    rows = data.jobs.map((job) => [job.jobId, job.title, job.department, job.status, job.totalApplications, job.selected, job.averageAiScore, job.emailDeliveryRate]);
  } else if (reportType === "hiring-funnel") {
    headers = ["Stage", "Count", "Percentage Of Applications", "Conversion From Previous", "Drop Off From Previous"];
    rows = data.historicalProgression.map((item) => [item.stage, item.count, item.percentageOfApplications, item.conversionFromPrevious, item.dropOffFromPrevious]);
  } else if (reportType === "emails") {
    rows = [["Sent", data.sent], ["Failed", data.failed], ["Pending", data.pending], ["Delivery Rate", data.deliveryRate], ["Failure Rate", data.failureRate]];
  } else if (reportType === "recruiters") {
    headers = ["Recruiter", "Status Changes", "Notes Added", "Interviews Scheduled", "Feedback Submitted", "Emails Sent", "Jobs Created", "Last Activity"];
    rows = data.recruiters.map((item) => [item.name, item.statusChanges, item.notesAdded, item.interviewsScheduled, item.feedbackSubmitted, item.emailsSent, item.jobsCreated, item.lastActivityDate]);
  } else if (reportType === "interviewers") {
    headers = ["Interviewer", "Assigned", "Completed", "Cancelled", "Feedback Submitted", "Average Rating", "Upcoming"];
    rows = data.interviewers.map((item) => [item.name, item.totalAssignedInterviews, item.completedInterviews, item.cancelledInterviews, item.feedbackSubmitted, item.averageCandidateRating, item.upcomingInterviewCount]);
  } else if (reportType === "skills") {
    headers = ["Skill", "Requested", "Available", "Skill Gap Percentage"];
    rows = data.demandVersusAvailability.map((item) => [item.skill, item.requested, item.available, item.skillGapPercentage]);
  } else {
    rows = Object.entries(data)
      .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value) || value?.value !== undefined)
      .map(([key, value]) => [key, value?.value ?? value]);
  }
  const generatedAt = new Date().toISOString();
  const csv = toCsv(["Generated At", generatedAt], []) + "\r\n" + toCsv(headers, rows.slice(0, ANALYTICS_EXPORT_ROW_LIMIT));
  const safeName = `hiresmart-${reportType}-analytics-${generatedAt.slice(0, 10)}.csv`;
  return { csv, filename: safeName, data };
};
