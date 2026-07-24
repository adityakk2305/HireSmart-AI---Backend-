import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  changeJobStatus as changeJobStatusService,
  createJobForCompany,
  deleteOrArchiveJob,
  getJobByIdForCompany,
  getJobSummaryForCompany,
  getJobsForCompany,
  getPublicJobBySlug as getPublicJobBySlugService,
  updateJobForCompany
} from "../services/jobService.js";

const publicUrl = (req, slug) => `${req.protocol}://${req.get("host")}/jobs/${slug}`;

const jobDetailsPayload = (req, job) => ({
  job: job.toSafeObject(),
  company: job.companyId?.toSafeObject
    ? job.companyId.toSafeObject()
    : job.companyId,
  createdBy: {
    id: job.createdBy?._id?.toString(),
    name: job.createdBy?.name,
    email: job.createdBy?.email,
    role: job.createdBy?.role
  },
  publicApplicationUrl: publicUrl(req, job.publicApplicationSlug)
});

export const createJob = asyncHandler(async (req, res) => {
  const job = await createJobForCompany(req.user.id, req.body);

  res.status(201).json(
    new ApiResponse(201, "Job created successfully", {
      job: job.toSafeObject(),
      publicApplicationUrl: publicUrl(req, job.publicApplicationSlug)
    })
  );
});

export const getJobs = asyncHandler(async (req, res) => {
  const data = await getJobsForCompany(req.user.id, req.query);

  res.status(200).json(new ApiResponse(200, "Jobs fetched successfully", data));
});

export const getJobSummary = asyncHandler(async (req, res) => {
  const data = await getJobSummaryForCompany(req.user.id);

  res.status(200).json(new ApiResponse(200, "Job summary fetched successfully", data));
});

export const getJobById = asyncHandler(async (req, res) => {
  const job = await getJobByIdForCompany(req.user.id, req.params.id);

  res.status(200).json(new ApiResponse(200, "Job fetched successfully", jobDetailsPayload(req, job)));
});

export const updateJob = asyncHandler(async (req, res) => {
  const job = await updateJobForCompany(req.user.id, req.params.id, req.body);

  res.status(200).json(new ApiResponse(200, "Job updated successfully", jobDetailsPayload(req, job)));
});

export const changeJobStatus = asyncHandler(async (req, res) => {
  const job = await changeJobStatusService(req.user.id, req.params.id, req.body.status);

  res.status(200).json(new ApiResponse(200, "Job status updated successfully", jobDetailsPayload(req, job)));
});

export const deleteJob = asyncHandler(async (req, res) => {
  const result = await deleteOrArchiveJob(req.user.id, req.params.id);

  res.status(200).json(
    new ApiResponse(200, `Job ${result.action} successfully`, {
      action: result.action,
      job: result.job.toSafeObject()
    })
  );
});

export const getPublicJobBySlug = asyncHandler(async (req, res) => {
  const data = await getPublicJobBySlugService(req.params.slug);

  res.status(200).json(new ApiResponse(200, "Public job fetched successfully", data));
});
