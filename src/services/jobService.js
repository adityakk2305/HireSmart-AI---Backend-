import mongoose from "mongoose";
import Candidate from "../models/Candidate.js";
import Company from "../models/Company.js";
import Job from "../models/Job.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";

const editableFields = [
  "title",
  "department",
  "employmentType",
  "workMode",
  "location",
  "minimumExperience",
  "maximumExperience",
  "requiredSkills",
  "preferredSkills",
  "education",
  "description",
  "responsibilities",
  "salaryMin",
  "salaryMax",
  "salaryCurrency",
  "salaryPeriod",
  "openings",
  "deadline",
  "screeningQuestions"
];

const statusTransitions = {
  Draft: ["Active", "Archived"],
  Active: ["Closed", "Archived"],
  Closed: ["Active", "Archived"],
  Archived: ["Draft"]
};

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "job";

const isPastDate = (date) => {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value < new Date();
};

export const sanitizeSkillArrays = (skills = []) => {
  const seen = new Set();
  return skills
    .map((skill) => String(skill || "").trim())
    .filter(Boolean)
    .filter((skill) => {
      const key = skill.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const generateUniqueJobSlug = async (title, location = "") => {
  const base = slugify([title, location].filter(Boolean).join(" "));
  let slug = `${base}-${Math.random().toString(16).slice(2, 8)}`;

  while (await Job.exists({ publicApplicationSlug: slug })) {
    slug = `${base}-${Math.random().toString(16).slice(2, 8)}`;
  }

  return slug;
};

export const ensureUserCompany = async (userId) => {
  const user = await User.findById(userId);

  if (!user || user.role !== "hr") {
    throw new ApiError(403, "Only HR users can manage jobs");
  }

  if (!user.companyId) {
    throw new ApiError(403, "Company onboarding is required before managing jobs");
  }

  const company = await Company.findOne({ _id: user.companyId, isActive: true });

  if (!company) {
    throw new ApiError(404, "Company not found");
  }

  return { user, company };
};

const applyStatusTimestamps = (job, nextStatus) => {
  if (nextStatus === "Active") {
    if (!job.publishedAt) job.publishedAt = new Date();
    job.closedAt = undefined;
    job.archivedAt = undefined;
  }

  if (nextStatus === "Closed") {
    job.closedAt = new Date();
  }

  if (nextStatus === "Archived") {
    job.archivedAt = new Date();
  }

  if (nextStatus === "Draft") {
    job.closedAt = undefined;
    job.archivedAt = undefined;
  }

  job.status = nextStatus;
};

const normalizeJobPayload = (payload, { partial = false } = {}) => {
  const normalized = { ...payload };

  if (!partial || "requiredSkills" in payload) {
    normalized.requiredSkills = sanitizeSkillArrays(payload.requiredSkills);
  }

  if (!partial || "preferredSkills" in payload) {
    normalized.preferredSkills = sanitizeSkillArrays(payload.preferredSkills || []);
  }

  if (!partial || "responsibilities" in payload) {
    normalized.responsibilities = (payload.responsibilities || []).map((item) => String(item).trim()).filter(Boolean);
  }

  if (!partial || "salaryMin" in payload) {
    normalized.salaryMin = payload.salaryMin === undefined ? null : payload.salaryMin;
  }

  if (!partial || "salaryMax" in payload) {
    normalized.salaryMax = payload.salaryMax === undefined ? null : payload.salaryMax;
  }

  if (!partial || "screeningQuestions" in payload) {
    normalized.screeningQuestions = (payload.screeningQuestions || []).map((question, index) => ({
      ...question,
      key: question.key || `question-${new mongoose.Types.ObjectId().toString()}`,
      options: question.type === "select" ? sanitizeSkillArrays(question.options || []) : [],
      order: index
    }));
  }

  return normalized;
};

export const createJobForCompany = async (userId, payload) => {
  const { user, company } = await ensureUserCompany(userId);
  const normalized = normalizeJobPayload(payload);
  const job = new Job({
    ...normalized,
    companyId: company._id,
    createdBy: user._id,
    publicApplicationSlug: await generateUniqueJobSlug(normalized.title, normalized.location)
  });

  applyStatusTimestamps(job, normalized.status || "Draft");
  await job.save();
  return job;
};

export const applyJobQueryFilters = (companyId, query) => {
  const filter = { companyId };

  if (query.status) filter.status = query.status;
  if (query.department) filter.department = query.department;
  if (query.employmentType) filter.employmentType = query.employmentType;
  if (query.workMode) filter.workMode = query.workMode;
  if (query.location) filter.location = new RegExp(escapeRegex(query.location), "i");

  if (query.deadlineFrom || query.deadlineTo) {
    filter.deadline = {};
    if (query.deadlineFrom) filter.deadline.$gte = query.deadlineFrom;
    if (query.deadlineTo) filter.deadline.$lte = query.deadlineTo;
  }

  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), "i");
    filter.$or = [
      { title: regex },
      { department: regex },
      { location: regex },
      { requiredSkills: regex },
      { preferredSkills: regex }
    ];
  }

  return filter;
};

const sortMap = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  "deadline-asc": { deadline: 1 },
  "deadline-desc": { deadline: -1 },
  "title-asc": { title: 1 },
  "title-desc": { title: -1 },
  "openings-desc": { openings: -1 }
};

export const getJobsForCompany = async (userId, query) => {
  const { company } = await ensureUserCompany(userId);
  const page = query.page;
  const limit = Math.min(query.limit, 100);
  const skip = (page - 1) * limit;
  const filter = applyJobQueryFilters(company._id, query);
  const [jobs, total] = await Promise.all([
    Job.find(filter).sort(sortMap[query.sort] || sortMap.newest).skip(skip).limit(limit).lean(),
    Job.countDocuments(filter)
  ]);
  const jobIds = jobs.map((job) => job._id);
  const candidateCounts = jobIds.length
    ? await Candidate.aggregate([
        { $match: { jobId: { $in: jobIds }, isDeleted: false } },
        { $group: { _id: "$jobId", count: { $sum: 1 } } }
      ])
    : [];
  const countsByJobId = new Map(candidateCounts.map((item) => [item._id.toString(), item.count]));
  const pages = Math.ceil(total / limit);

  return {
    jobs: jobs.map((job) => ({
      ...job,
      id: job._id.toString(),
      candidateCount: countsByJobId.get(job._id.toString()) || 0
    })),
    pagination: {
      page,
      limit,
      total,
      pages,
      hasNextPage: page < pages,
      hasPreviousPage: page > 1
    }
  };
};

export const getJobSummaryForCompany = async (userId) => {
  const { company } = await ensureUserCompany(userId);
  const [total, byStatus] = await Promise.all([
    Job.countDocuments({ companyId: company._id }),
    Job.aggregate([
      { $match: { companyId: company._id } },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ])
  ]);

  const statusCounts = { Draft: 0, Active: 0, Closed: 0, Archived: 0 };
  byStatus.forEach((item) => {
    statusCounts[item._id] = item.count;
  });

  return {
    total,
    statusCounts,
    candidates: 0,
    upcomingInterviews: 0
  };
};

export const getJobByIdForCompany = async (userId, jobId) => {
  const { company } = await ensureUserCompany(userId);
  const job = await Job.findOne({ _id: jobId, companyId: company._id })
    .populate("companyId", "name logo website industry size city state country")
    .populate("createdBy", "name email role");

  if (!job) {
    throw new ApiError(404, "Job not found");
  }

  job.candidateCount = await Candidate.countDocuments({ jobId: job._id, isDeleted: false });

  return job;
};

export const updateJobForCompany = async (userId, jobId, payload) => {
  const job = await getJobByIdForCompany(userId, jobId);
  const updates = normalizeJobPayload(payload, { partial: true });
  const requestedStatus = updates.status;
  delete updates.status;

  Object.keys(updates).forEach((key) => {
    if (editableFields.includes(key)) job[key] = updates[key];
  });

  if (job.status === "Active" && isPastDate(job.deadline)) {
    throw new ApiError(400, "Active jobs cannot have a past deadline");
  }

  if (job.maximumExperience < job.minimumExperience) {
    throw new ApiError(400, "Invalid experience range");
  }

  if (job.salaryMin !== null && job.salaryMax !== null && job.salaryMax < job.salaryMin) {
    throw new ApiError(400, "Invalid salary range");
  }

  if (requestedStatus && requestedStatus !== job.status) {
    if (!statusTransitions[job.status]?.includes(requestedStatus)) {
      throw new ApiError(400, `Cannot change job status from ${job.status} to ${requestedStatus}`);
    }

    if (requestedStatus === "Active" && isPastDate(job.deadline)) {
      throw new ApiError(400, "Cannot activate a job with a past deadline");
    }

    applyStatusTimestamps(job, requestedStatus);
  }

  await job.save();
  return job;
};

export const changeJobStatus = async (userId, jobId, nextStatus) => {
  const job = await getJobByIdForCompany(userId, jobId);

  if (job.status === nextStatus) return job;

  if (!statusTransitions[job.status]?.includes(nextStatus)) {
    throw new ApiError(400, `Cannot change job status from ${job.status} to ${nextStatus}`);
  }

  if (nextStatus === "Active" && isPastDate(job.deadline)) {
    throw new ApiError(400, "Cannot activate a job with a past deadline");
  }

  applyStatusTimestamps(job, nextStatus);
  await job.save();
  return job;
};

export const deleteOrArchiveJob = async (userId, jobId) => {
  const job = await getJobByIdForCompany(userId, jobId);
  const candidateCount = await Candidate.countDocuments({ jobId: job._id, isDeleted: false });

  if (job.status === "Active") {
    applyStatusTimestamps(job, "Archived");
    await job.save();
    return { action: "archived", job };
  }

  if ((job.status === "Draft" || job.status === "Archived") && candidateCount === 0) {
    await Job.deleteOne({ _id: job._id });
    return { action: "deleted", job };
  }

  applyStatusTimestamps(job, "Archived");
  await job.save();
  return { action: "archived", job };
};

export const getPublicJobBySlug = async (slug) => {
  const job = await Job.findOne({ publicApplicationSlug: slug, status: "Active" })
    .populate("companyId", "name logo website industry size city state country")
    .lean();

  if (!job || isPastDate(job.deadline)) {
    throw new ApiError(404, "Job is unavailable");
  }

  return {
    job: {
      id: job._id.toString(),
      title: job.title,
      department: job.department,
      employmentType: job.employmentType,
      workMode: job.workMode,
      location: job.location,
      minimumExperience: job.minimumExperience,
      maximumExperience: job.maximumExperience,
      requiredSkills: job.requiredSkills,
      preferredSkills: job.preferredSkills,
      education: job.education,
      description: job.description,
      responsibilities: job.responsibilities,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryCurrency: job.salaryCurrency,
      salaryPeriod: job.salaryPeriod,
      openings: job.openings,
      deadline: job.deadline,
      screeningQuestions: job.screeningQuestions,
      publicApplicationSlug: job.publicApplicationSlug,
      publishedAt: job.publishedAt
    },
    company: {
      name: job.companyId.name,
      logo: job.companyId.logo,
      website: job.companyId.website,
      industry: job.companyId.industry,
      size: job.companyId.size,
      city: job.companyId.city,
      state: job.companyId.state,
      country: job.companyId.country
    }
  };
};
