import mongoose from "mongoose";
import aiConfig from "../config/ai.js";
import { getSafeMailConfig } from "../config/mail.js";
import env from "../config/env.js";
import AuditLog from "../models/AuditLog.js";
import Candidate from "../models/Candidate.js";
import Company from "../models/Company.js";
import EmailLog from "../models/EmailLog.js";
import Interview from "../models/Interview.js";
import Job from "../models/Job.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import { STATUS_HISTORY_ACTIONS } from "../constants/analyticsConstants.js";

const objectId = (value) => new mongoose.Types.ObjectId(String(value));
const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const percent = (part, total) => (total ? Math.round((Number(part || 0) / Number(total)) * 10000) / 100 : 0);

export const createAuditLog = async ({
  actor = null,
  companyId = null,
  action,
  entityType,
  entityId = null,
  entityLabel = "",
  description = "",
  metadata = {}
}) =>
  AuditLog.create({
    actorId: actor?._id || actor?.id || null,
    actorName: actor?.name || actor?.email || "System",
    actorRole: actor?.role || "system",
    companyId,
    action,
    entityType,
    entityId,
    entityLabel,
    description,
    metadata
  });

const trend = async (Model, dateField = "createdAt") => {
  const since = new Date();
  since.setDate(since.getDate() - 29);
  return Model.aggregate([
    { $match: { [dateField]: { $gte: since } } },
    { $group: { _id: { $dateToString: { date: `$${dateField}`, format: "%Y-%m-%d", timezone: "Asia/Kolkata" } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]).then((rows) => rows.map((row) => ({ label: row._id, count: row.count })));
};

export const getPlatformOverview = async () => {
  const [
    totalCompanies,
    activeCompanies,
    suspendedCompanies,
    disabledCompanies,
    totalUsers,
    hrUsers,
    adminUsers,
    activeJobs,
    totalCandidates,
    totalInterviews,
    totalEmails,
    sentEmails,
    failedEmails,
    parsedResumes,
    aiScreenedCandidates,
    recentCompanies,
    companiesCreatedTrend,
    userGrowthTrend,
    candidateGrowthTrend,
    interviewGrowthTrend,
    recentAudit,
    pendingEmails
  ] = await Promise.all([
    Company.countDocuments(),
    Company.countDocuments({ accountStatus: "Active", isActive: true }),
    Company.countDocuments({ accountStatus: "Suspended" }),
    Company.countDocuments({ accountStatus: "Disabled" }),
    User.countDocuments(),
    User.countDocuments({ role: "hr" }),
    User.countDocuments({ role: "admin" }),
    Job.countDocuments({ status: "Active" }),
    Candidate.countDocuments({ isDeleted: false }),
    Interview.countDocuments(),
    EmailLog.countDocuments(),
    EmailLog.countDocuments({ status: "Sent" }),
    EmailLog.countDocuments({ status: "Failed" }),
    Candidate.countDocuments({ resumeParseStatus: "Parsed", isDeleted: false }),
    Candidate.countDocuments({ aiScreeningStatus: "Screened", isDeleted: false }),
    getRecentCompanies(),
    trend(Company),
    trend(User),
    trend(Candidate, "appliedAt"),
    trend(Interview, "startTime"),
    AuditLog.find().sort({ createdAt: -1 }).limit(10).lean(),
    EmailLog.countDocuments({ status: "Pending" })
  ]);

  return {
    totalCompanies,
    activeCompanies,
    suspendedCompanies,
    disabledCompanies,
    totalUsers,
    hrUsers,
    adminUsers,
    activeJobs,
    totalCandidates,
    totalInterviews,
    totalEmails,
    sentEmails,
    failedEmails,
    parsedResumes,
    aiScreenedCandidates,
    recentCompanies,
    companiesCreatedTrend,
    userGrowthTrend,
    candidateGrowthTrend,
    interviewGrowthTrend,
    platformActivity: recentAudit.map((item) => ({
      id: item._id.toString(),
      action: item.action,
      entityType: item.entityType,
      entityLabel: item.entityLabel,
      actorName: item.actorName,
      createdAt: item.createdAt
    })),
    systemHealth: {
      apiStatus: "OK",
      databaseStatus: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
      nodeEnvironment: env.nodeEnv,
      mailProvider: getSafeMailConfig().provider,
      pendingEmails,
      failedEmails,
      serverTime: new Date().toISOString()
    }
  };
};

export const getRecentCompanies = async () => {
  const companies = await Company.find()
    .select("name slug industry size city state country accountStatus isActive createdAt updatedAt")
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  return companies.map((company) => ({
    id: company._id.toString(),
    name: company.name,
    slug: company.slug,
    industry: company.industry,
    size: company.size,
    location: [company.city, company.state, company.country].filter(Boolean).join(", "),
    accountStatus: company.accountStatus || (company.isActive ? "Active" : "Disabled"),
    createdAt: company.createdAt,
    updatedAt: company.updatedAt
  }));
};

const companySafeSummary = async (company) => {
  const [userCount, jobCount, candidateCount, interviewCount, emailCount, aiScreeningCount, primaryHr] = await Promise.all([
    User.countDocuments({ companyId: company._id }),
    Job.countDocuments({ companyId: company._id }),
    Candidate.countDocuments({ companyId: company._id, isDeleted: false }),
    Interview.countDocuments({ companyId: company._id }),
    EmailLog.countDocuments({ companyId: company._id }),
    Candidate.countDocuments({ companyId: company._id, aiScreeningStatus: "Screened", isDeleted: false }),
    User.findOne({ companyId: company._id, role: "hr" }).select("name email isActive accountStatus lastLoginAt").lean()
  ]);
  return {
    id: company._id.toString(),
    name: company.name,
    slug: company.slug,
    industry: company.industry,
    size: company.size,
    city: company.city,
    state: company.state,
    country: company.country,
    contactEmail: company.contactEmail,
    accountStatus: company.accountStatus || (company.isActive ? "Active" : "Disabled"),
    isActive: company.isActive,
    statusReason: company.statusReason || "",
    statusChangedAt: company.statusChangedAt,
    statusHistory: company.statusHistory || [],
    userCount,
    jobCount,
    candidateCount,
    interviewCount,
    emailCount,
    aiScreeningCount,
    lastActivity: company.updatedAt,
    primaryHrContact: primaryHr
      ? {
          id: primaryHr._id.toString(),
          name: primaryHr.name,
          email: primaryHr.email,
          accountStatus: primaryHr.accountStatus || (primaryHr.isActive ? "Active" : "Disabled"),
          lastLoginAt: primaryHr.lastLoginAt
        }
      : null,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt
  };
};

export const getAdminCompanies = async (query = {}) => {
  const page = Number(query.page || 1);
  const limit = Math.min(Number(query.limit || 10), 100);
  const filter = {};
  if (query.status) filter.accountStatus = query.status;
  if (query.industry) filter.industry = query.industry;
  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), "i");
    filter.$or = [{ name: regex }, { slug: regex }, { industry: regex }, { city: regex }, { contactEmail: regex }];
  }
  if (query.dateFrom || query.dateTo) {
    filter.createdAt = {};
    if (query.dateFrom) filter.createdAt.$gte = new Date(query.dateFrom);
    if (query.dateTo) filter.createdAt.$lte = new Date(query.dateTo);
  }
  const sortMap = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    name: { name: 1 },
    "most-users": { createdAt: -1 }
  };
  const [companies, total] = await Promise.all([
    Company.find(filter).sort(sortMap[query.sort] || sortMap.newest).skip((page - 1) * limit).limit(limit).lean(),
    Company.countDocuments(filter)
  ]);
  return {
    companies: await Promise.all(companies.map(companySafeSummary)),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
  };
};

export const getAdminCompanyDetails = async (id) => {
  const company = await Company.findById(id).lean();
  if (!company) throw new ApiError(404, "Company not found");
  const summary = await companySafeSummary(company);
  const [recentJobs, recentEmails] = await Promise.all([
    Job.find({ companyId: id }).select("title department status createdAt").sort({ createdAt: -1 }).limit(5).lean(),
    EmailLog.find({ companyId: id }).select("emailType status provider createdAt").sort({ createdAt: -1 }).limit(5).lean()
  ]);
  return {
    company: summary,
    recentOperationalSummary: {
      recentJobs: recentJobs.map((job) => ({ id: job._id.toString(), title: job.title, department: job.department, status: job.status, createdAt: job.createdAt })),
      recentEmails: recentEmails.map((email) => ({ id: email._id.toString(), emailType: email.emailType, status: email.status, provider: email.provider, createdAt: email.createdAt }))
    }
  };
};

export const updateCompanyAccountStatus = async (adminUserId, companyId, { status, reason }) => {
  if (!reason?.trim()) throw new ApiError(400, "Reason is required");
  const [admin, company] = await Promise.all([User.findById(adminUserId), Company.findById(companyId)]);
  if (!admin || admin.role !== "admin") throw new ApiError(403, "Admin access is required");
  if (!company) throw new ApiError(404, "Company not found");
  const previousStatus = company.accountStatus || (company.isActive ? "Active" : "Disabled");
  company.accountStatus = status;
  company.isActive = status === "Active";
  company.statusReason = reason;
  company.statusChangedBy = admin._id;
  company.statusChangedAt = new Date();
  company.statusHistory.push({ previousStatus, newStatus: status, reason, changedBy: admin._id, changedAt: company.statusChangedAt });
  await company.save();
  await createAuditLog({
    actor: admin,
    companyId: company._id,
    action: STATUS_HISTORY_ACTIONS.COMPANY_STATUS_CHANGED,
    entityType: "Company",
    entityId: company._id,
    entityLabel: company.name,
    description: `Company account status changed from ${previousStatus} to ${status}.`,
    metadata: { previousStatus, newStatus: status }
  });
  return companySafeSummary(company);
};

const userSafeSummary = (user, company = null) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  company: company ? { id: company._id.toString(), name: company.name, accountStatus: company.accountStatus || (company.isActive ? "Active" : "Disabled") } : null,
  companyId: user.companyId,
  phone: user.phone,
  isActive: user.isActive,
  accountStatus: user.accountStatus || (user.isActive ? "Active" : "Disabled"),
  statusReason: user.statusReason || "",
  statusChangedAt: user.statusChangedAt,
  statusHistory: user.statusHistory || [],
  emailVerified: true,
  lastLoginAt: user.lastLoginAt,
  lastActivity: user.lastLoginAt || user.updatedAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

export const getAdminUsers = async (query = {}) => {
  const page = Number(query.page || 1);
  const limit = Math.min(Number(query.limit || 10), 100);
  const filter = {};
  if (query.role) filter.role = query.role;
  if (query.status) filter.accountStatus = query.status;
  if (query.companyId) filter.companyId = objectId(query.companyId);
  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), "i");
    filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
  }
  const [users, total] = await Promise.all([
    User.find(filter).populate("companyId", "name accountStatus isActive").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter)
  ]);
  return {
    users: users.map((user) => userSafeSummary(user, user.companyId?._id ? user.companyId : null)),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
  };
};

export const getAdminUserDetails = async (id) => {
  const user = await User.findById(id).populate("companyId", "name accountStatus isActive").lean();
  if (!user) throw new ApiError(404, "User not found");
  return { user: userSafeSummary(user, user.companyId?._id ? user.companyId : null) };
};

export const updateUserAccountStatus = async (adminUserId, userId, { status, reason }) => {
  if (!reason?.trim()) throw new ApiError(400, "Reason is required");
  const [admin, user] = await Promise.all([User.findById(adminUserId), User.findById(userId)]);
  if (!admin || admin.role !== "admin") throw new ApiError(403, "Admin access is required");
  if (!user) throw new ApiError(404, "User not found");
  if (String(admin._id) === String(user._id) && status !== "Active") throw new ApiError(400, "Current admin cannot be suspended or disabled");
  if (user.role === "admin" && status !== "Active") {
    const activeAdmins = await User.countDocuments({ role: "admin", accountStatus: "Active", isActive: true, _id: { $ne: user._id } });
    if (activeAdmins < 1) throw new ApiError(400, "The last active admin cannot be disabled");
  }
  const previousStatus = user.accountStatus || (user.isActive ? "Active" : "Disabled");
  user.accountStatus = status;
  user.isActive = status === "Active";
  user.statusReason = reason;
  user.statusChangedBy = admin._id;
  user.statusChangedAt = new Date();
  user.statusHistory.push({ previousStatus, newStatus: status, reason, changedBy: admin._id, changedAt: user.statusChangedAt });
  await user.save({ validateBeforeSave: false });
  await createAuditLog({
    actor: admin,
    companyId: user.companyId || null,
    action: STATUS_HISTORY_ACTIONS.USER_STATUS_CHANGED,
    entityType: "User",
    entityId: user._id,
    entityLabel: user.email,
    description: `User account status changed from ${previousStatus} to ${status}.`,
    metadata: { previousStatus, newStatus: status }
  });
  return userSafeSummary(user);
};

export const getAuditLogs = async (query = {}) => {
  const page = Number(query.page || 1);
  const limit = Math.min(Number(query.limit || 20), 100);
  const filter = {};
  if (query.action) filter.action = query.action;
  if (query.entityType) filter.entityType = query.entityType;
  if (query.actorId) filter.actorId = objectId(query.actorId);
  if (query.companyId) filter.companyId = objectId(query.companyId);
  if (query.dateFrom || query.dateTo) {
    filter.createdAt = {};
    if (query.dateFrom) filter.createdAt.$gte = new Date(query.dateFrom);
    if (query.dateTo) filter.createdAt.$lte = new Date(query.dateTo);
  }
  const [logs, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter)
  ]);
  return {
    logs: logs.map((log) => ({
      id: log._id.toString(),
      timestamp: log.createdAt,
      actor: log.actorName,
      actorRole: log.actorRole,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      entity: log.entityLabel,
      companyId: log.companyId,
      description: log.description
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
  };
};

export const getSystemHealth = async () => {
  const [pendingEmails, failedEmails, staleProcessingEmails, totalEmails] = await Promise.all([
    EmailLog.countDocuments({ status: "Pending" }),
    EmailLog.countDocuments({ status: "Failed" }),
    EmailLog.countDocuments({ status: "Processing", updatedAt: { $lt: new Date(Date.now() - 15 * 60 * 1000) } }),
    EmailLog.countDocuments()
  ]);
  return {
    apiStatus: "OK",
    databaseStatus: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
    applicationUptimeSeconds: Math.round(process.uptime()),
    nodeEnvironment: env.nodeEnv,
    mailProviderStatus: getSafeMailConfig(),
    aiProviderConfiguration: {
      provider: aiConfig.provider,
      openaiConfigured: Boolean(aiConfig.openaiApiKey),
      geminiConfigured: Boolean(aiConfig.geminiApiKey)
    },
    pendingEmails,
    failedEmails,
    staleProcessingEmails,
    emailFailureRate: percent(failedEmails, totalEmails),
    serverTime: new Date().toISOString()
  };
};

export const getCompanyGrowth = trend;
export const getUserGrowth = () => trend(User);
export const getJobGrowth = () => trend(Job);
export const getCandidateGrowth = () => trend(Candidate, "appliedAt");
export const getInterviewGrowth = () => trend(Interview, "startTime");
export const getEmailHealth = getSystemHealth;
export const getAiUsageSummary = async () => ({
  aiScreenedCandidates: await Candidate.countDocuments({ aiScreeningStatus: "Screened", isDeleted: false }),
  failedAiScreenings: await Candidate.countDocuments({ aiScreeningStatus: "Failed", isDeleted: false }),
  parsedResumes: await Candidate.countDocuments({ resumeParseStatus: "Parsed", isDeleted: false })
});
export const getSystemActivitySummary = getAuditLogs;
