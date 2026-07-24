import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  exportAnalyticsReport,
  getAiScreeningAnalytics,
  getAnalyticsOverview,
  getAnalyticsSummary,
  getCandidateAnalytics,
  getCandidateSourcesAnalytics,
  getEmailAnalytics,
  getHiringFunnelAnalytics,
  getInterviewAnalytics,
  getInterviewerAnalytics,
  getJobAnalytics,
  getJobAnalyticsDetails,
  getRecruiterAnalytics,
  getSkillAnalytics
} from "../services/analyticsService.js";

export const getSummary = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, "Analytics summary fetched", await getAnalyticsSummary(req.user.id, req.query)));
});

export const getOverview = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, "Analytics overview fetched", await getAnalyticsOverview(req.user.id, req.query)));
});

export const getHiringFunnel = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, "Hiring funnel analytics fetched", await getHiringFunnelAnalytics(req.user.id, req.query)));
});

export const getCandidateSources = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, "Candidate source analytics fetched", await getCandidateSourcesAnalytics(req.user.id, req.query)));
});

export const getCandidates = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, "Candidate analytics fetched", await getCandidateAnalytics(req.user.id, req.query)));
});

export const getAiScreening = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, "AI screening analytics fetched", await getAiScreeningAnalytics(req.user.id, req.query)));
});

export const getSkills = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, "Skill analytics fetched", await getSkillAnalytics(req.user.id, req.query)));
});

export const getJobs = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, "Job analytics fetched", await getJobAnalytics(req.user.id, req.query)));
});

export const getJobDetails = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, "Job analytics details fetched", await getJobAnalyticsDetails(req.user.id, req.params.jobId, req.query)));
});

export const getInterviews = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, "Interview analytics fetched", await getInterviewAnalytics(req.user.id, req.query)));
});

export const getInterviewers = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, "Interviewer analytics fetched", await getInterviewerAnalytics(req.user.id, req.query)));
});

export const getEmails = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, "Email analytics fetched", await getEmailAnalytics(req.user.id, req.query)));
});

export const getRecruiters = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, "Recruiter analytics fetched", await getRecruiterAnalytics(req.user.id, req.query)));
});

export const exportReport = asyncHandler(async (req, res) => {
  const { csv, filename, data } = await exportAnalyticsReport(req.user.id, req.query);
  if (req.query.format === "json") {
    return res.status(200).json(new ApiResponse(200, "Analytics report exported", { generatedAt: new Date().toISOString(), reportType: req.query.reportType, data }));
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(csv);
});
