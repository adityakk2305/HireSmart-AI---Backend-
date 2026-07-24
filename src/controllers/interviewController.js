import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  addInterviewFeedback,
  cancelInterview as cancelInterviewService,
  completeInterview as completeInterviewService,
  createInterview as createInterviewService,
  generateQuestionsForInterview,
  getCandidateInterviewHistory,
  getInterviewByIdForCompany,
  getInterviewsForCompany,
  getInterviewSummary as getInterviewSummaryService,
  getTodayInterviews as getTodayInterviewsService,
  getUpcomingInterviews as getUpcomingInterviewsService,
  rescheduleInterview as rescheduleInterviewService,
  updateInterview as updateInterviewService,
  updateInterviewStatus as updateInterviewStatusService
} from "../services/interviewService.js";

export const createInterview = asyncHandler(async (req, res) => {
  const interview = await createInterviewService(req.user.id, req.body);
  res.status(201).json(new ApiResponse(201, "Interview scheduled successfully", { interview }));
});

export const getInterviews = asyncHandler(async (req, res) => {
  const data = await getInterviewsForCompany(req.user.id, req.query);
  res.status(200).json(new ApiResponse(200, "Interviews fetched successfully", data));
});

export const getInterviewById = asyncHandler(async (req, res) => {
  const interview = await getInterviewByIdForCompany(req.user.id, req.params.id);
  res.status(200).json(new ApiResponse(200, "Interview fetched successfully", { interview }));
});

export const updateInterview = asyncHandler(async (req, res) => {
  const interview = await updateInterviewService(req.user.id, req.params.id, req.body);
  res.status(200).json(new ApiResponse(200, "Interview updated successfully", { interview }));
});

export const rescheduleInterview = asyncHandler(async (req, res) => {
  const interview = await rescheduleInterviewService(req.user.id, req.params.id, req.body);
  res.status(200).json(new ApiResponse(200, "Interview rescheduled successfully", { interview }));
});

export const cancelInterview = asyncHandler(async (req, res) => {
  const interview = await cancelInterviewService(req.user.id, req.params.id, req.body.reason);
  res.status(200).json(new ApiResponse(200, "Interview cancelled successfully", { interview }));
});

export const updateInterviewStatus = asyncHandler(async (req, res) => {
  const interview = await updateInterviewStatusService(req.user.id, req.params.id, req.body.status);
  res.status(200).json(new ApiResponse(200, "Interview status updated successfully", { interview }));
});

export const completeInterview = asyncHandler(async (req, res) => {
  const interview = await completeInterviewService(req.user.id, req.params.id);
  res.status(200).json(new ApiResponse(200, "Interview completed successfully", { interview }));
});

export const getCandidateInterviews = asyncHandler(async (req, res) => {
  const data = await getCandidateInterviewHistory(req.user.id, req.params.candidateId);
  res.status(200).json(new ApiResponse(200, "Candidate interviews fetched successfully", data));
});

export const getInterviewSummary = asyncHandler(async (req, res) => {
  const data = await getInterviewSummaryService(req.user.id, req.query.timezone);
  res.status(200).json(new ApiResponse(200, "Interview summary fetched successfully", data));
});

export const getUpcomingInterviews = asyncHandler(async (req, res) => {
  const data = await getUpcomingInterviewsService(req.user.id, req.query);
  res.status(200).json(new ApiResponse(200, "Upcoming interviews fetched successfully", data));
});

export const getTodayInterviews = asyncHandler(async (req, res) => {
  const data = await getTodayInterviewsService(req.user.id, req.query.timezone);
  res.status(200).json(new ApiResponse(200, "Today's interviews fetched successfully", data));
});

export const addFeedback = asyncHandler(async (req, res) => {
  const interview = await addInterviewFeedback(req.user.id, req.params.id, req.body);
  res.status(201).json(new ApiResponse(201, "Interview feedback submitted successfully", { interview }));
});

export const updateFeedback = asyncHandler(async (req, res) => {
  const interview = await addInterviewFeedback(req.user.id, req.params.id, req.body, req.params.feedbackId);
  res.status(200).json(new ApiResponse(200, "Interview feedback updated successfully", { interview }));
});

export const generateInterviewQuestions = asyncHandler(async (req, res) => {
  const data = await generateQuestionsForInterview(req.user.id, req.params.id, req.body);
  res.status(200).json(new ApiResponse(200, "Interview questions generated successfully", data));
});
