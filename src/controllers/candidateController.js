import path from "path";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  createCandidateByHR,
  createPublicApplication,
  addRecruiterNoteForCompany,
  bulkScreenCandidatesForCompany,
  bulkCandidateActionForCompany,
  compareCandidatesForCompany,
  deleteCandidateForCompany,
  deleteRecruiterNoteForCompany,
  exportCandidatesForCompany,
  getCandidateAiEvaluationForCompany,
  getCandidateAiSummaryForCompany,
  getCandidateByIdForCompany,
  getCandidateResumeForCompany,
  getCandidateStatusHistory as getCandidateStatusHistoryService,
  getCandidateStatusPublicly,
  getCandidateSummaryForCompany,
  getCandidateResumeDataForCompany,
  getCandidatesByJobForCompany,
  getCandidatesForCompany,
  parseCandidateResumeForCompany,
  screenCandidateForCompany,
  updateRecruiterNoteForCompany,
  updateCandidateForCompany,
  updateCandidateStatus as updateCandidateStatusService
} from "../services/candidateService.js";
import { queueCandidateStatusEmail } from "../services/emailAutomationService.js";

const jobSummary = (job) => job && ({
  id: job._id?.toString() || job.id,
  title: job.title,
  department: job.department,
  location: job.location,
  employmentType: job.employmentType,
  workMode: job.workMode,
  requiredSkills: job.requiredSkills,
  preferredSkills: job.preferredSkills,
  minimumExperience: job.minimumExperience,
  maximumExperience: job.maximumExperience,
  education: job.education,
  status: job.status,
  publicApplicationSlug: job.publicApplicationSlug
});

const companySummary = (company) => company && ({
  id: company._id?.toString() || company.id,
  name: company.name,
  logo: company.logo,
  industry: company.industry,
  city: company.city,
  state: company.state,
  country: company.country
});

const createdBySummary = (user) => user && ({
  id: user._id?.toString() || user.id,
  name: user.name,
  email: user.email,
  role: user.role
});

const candidateDetailsPayload = (candidate) => ({
  candidate: candidate.toSafeDetails(),
  job: jobSummary(candidate.jobId),
  company: companySummary(candidate.companyId),
  createdBy: createdBySummary(candidate.createdBy)
});

export const applyToJob = asyncHandler(async (req, res) => {
  const data = await createPublicApplication(req.params.jobSlug, req.body, req.file);

  res.status(201).json(new ApiResponse(201, "Application submitted successfully", data));
});

export const uploadCandidateByHR = asyncHandler(async (req, res) => {
  const candidate = await createCandidateByHR(req.user.id, req.params.jobId, req.body, req.file);

  res.status(201).json(new ApiResponse(201, "Candidate uploaded successfully", candidateDetailsPayload(candidate)));
});

export const getCandidates = asyncHandler(async (req, res) => {
  const data = await getCandidatesForCompany(req.user.id, req.query);

  res.status(200).json(new ApiResponse(200, "Candidates fetched successfully", data));
});

export const getCandidateSummary = asyncHandler(async (req, res) => {
  const data = await getCandidateSummaryForCompany(req.user.id);

  res.status(200).json(new ApiResponse(200, "Candidate summary fetched successfully", data));
});

export const getCandidatesByJob = asyncHandler(async (req, res) => {
  const data = await getCandidatesByJobForCompany(req.user.id, req.params.jobId, req.query);

  res.status(200).json(new ApiResponse(200, "Job candidates fetched successfully", data));
});

export const getCandidateById = asyncHandler(async (req, res) => {
  const candidate = await getCandidateByIdForCompany(req.user.id, req.params.id);

  res.status(200).json(new ApiResponse(200, "Candidate fetched successfully", candidateDetailsPayload(candidate)));
});

export const updateCandidate = asyncHandler(async (req, res) => {
  const candidate = await updateCandidateForCompany(req.user.id, req.params.id, req.body);

  res.status(200).json(new ApiResponse(200, "Candidate updated successfully", candidateDetailsPayload(candidate)));
});

export const updateCandidateStatus = asyncHandler(async (req, res) => {
  const candidate = await updateCandidateStatusService(req.user.id, req.params.id, req.body.status, req.body.note);
  let emailResult = null;

  if (req.body.sendEmail) {
    try {
      const result = await queueCandidateStatusEmail(req.user.id, req.params.id, req.body.status, { explicit: true, force: req.body.forceEmail });
      emailResult = {
        success: Boolean(result.log && result.log.status === "Sent"),
        skipped: result.skipped || false,
        duplicate: result.duplicate || false,
        reason: result.reason || "",
        log: result.log?.toSafeObject?.() || null
      };
    } catch (error) {
      emailResult = {
        success: false,
        skipped: false,
        duplicate: false,
        reason: error.message || "Email delivery failed",
        log: null
      };
    }
  }

  res.status(200).json(new ApiResponse(200, "Candidate status updated successfully", {
    ...candidateDetailsPayload(candidate),
    emailResult
  }));
});

export const deleteCandidate = asyncHandler(async (req, res) => {
  const data = await deleteCandidateForCompany(req.user.id, req.params.id, req.body?.deletionReason || req.query.deletionReason);

  res.status(200).json(new ApiResponse(200, "Candidate deleted successfully", data));
});

export const getCandidateStatusHistory = asyncHandler(async (req, res) => {
  const data = await getCandidateStatusHistoryService(req.user.id, req.params.id);

  res.status(200).json(new ApiResponse(200, "Candidate status history fetched successfully", { history: data }));
});

export const lookupApplicationStatus = asyncHandler(async (req, res) => {
  const data = await getCandidateStatusPublicly(req.query.applicationId, req.query.email);

  res.status(200).json(new ApiResponse(200, "Application status fetched successfully", data));
});

export const downloadOrPreviewResume = asyncHandler(async (req, res) => {
  const resume = await getCandidateResumeForCompany(req.user.id, req.params.id);
  const disposition = resume.mimeType === "application/pdf" ? "inline" : "attachment";
  const safeName = path.basename(resume.originalName).replace(/["\r\n]/g, "_");

  res.setHeader("Content-Type", resume.mimeType);
  res.setHeader("Content-Disposition", `${disposition}; filename="${safeName}"`);
  res.sendFile(resume.absolutePath);
});

export const parseCandidateResume = asyncHandler(async (req, res) => {
  const data = await parseCandidateResumeForCompany(req.user.id, req.params.id, req.query.force);

  res.status(200).json(new ApiResponse(200, "Resume parsed successfully", data));
});

export const getCandidateResumeData = asyncHandler(async (req, res) => {
  const data = await getCandidateResumeDataForCompany(req.user.id, req.params.id);

  res.status(200).json(new ApiResponse(200, "Resume parsing data fetched successfully", data));
});

export const screenCandidate = asyncHandler(async (req, res) => {
  const force = req.query.force === true || req.query.force === "true";
  const data = await screenCandidateForCompany(req.user.id, req.params.id, force);

  res.status(200).json(new ApiResponse(200, "Candidate screening completed", data));
});

export const getCandidateAiEvaluation = asyncHandler(async (req, res) => {
  const data = await getCandidateAiEvaluationForCompany(req.user.id, req.params.id);

  res.status(200).json(new ApiResponse(200, "AI evaluation fetched successfully", data));
});

export const bulkScreenCandidates = asyncHandler(async (req, res) => {
  const data = await bulkScreenCandidatesForCompany(req.user.id, req.body.candidateIds, req.body.force);

  res.status(200).json(new ApiResponse(200, "Bulk screening completed", data));
});

export const getCandidateAiSummary = asyncHandler(async (req, res) => {
  const data = await getCandidateAiSummaryForCompany(req.user.id);

  res.status(200).json(new ApiResponse(200, "AI screening summary fetched successfully", data));
});

export const addRecruiterNote = asyncHandler(async (req, res) => {
  const note = await addRecruiterNoteForCompany(req.user.id, req.params.id, req.body.text);

  res.status(201).json(new ApiResponse(201, "Recruiter note added successfully", { note }));
});

export const updateRecruiterNote = asyncHandler(async (req, res) => {
  const note = await updateRecruiterNoteForCompany(req.user.id, req.params.id, req.params.noteId, req.body.text);

  res.status(200).json(new ApiResponse(200, "Recruiter note updated successfully", { note }));
});

export const deleteRecruiterNote = asyncHandler(async (req, res) => {
  const data = await deleteRecruiterNoteForCompany(req.user.id, req.params.id, req.params.noteId);

  res.status(200).json(new ApiResponse(200, "Recruiter note deleted successfully", data));
});

export const performBulkCandidateAction = asyncHandler(async (req, res) => {
  const data = await bulkCandidateActionForCompany(req.user.id, req.body.candidateIds, req.body.action, req.body);

  res.status(200).json(new ApiResponse(200, "Bulk action completed", data));
});

export const compareCandidates = asyncHandler(async (req, res) => {
  const data = await compareCandidatesForCompany(req.user.id, req.body.candidateIds);

  res.status(200).json(new ApiResponse(200, "Candidate comparison fetched successfully", data));
});

export const exportCandidates = asyncHandler(async (req, res) => {
  const { csv } = await exportCandidatesForCompany(req.user.id, req.query);
  const date = new Date().toISOString().slice(0, 10);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="hiresmart-candidates-${date}.csv"`);
  res.status(200).send(csv);
});
