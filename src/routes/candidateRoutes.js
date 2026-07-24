import { Router } from "express";
import {
  applyToJob,
  addRecruiterNote,
  compareCandidates,
  deleteRecruiterNote,
  bulkScreenCandidates,
  exportCandidates,
  performBulkCandidateAction,
  deleteCandidate,
  downloadOrPreviewResume,
  getCandidateAiEvaluation,
  getCandidateAiSummary,
  getCandidateById,
  getCandidateStatusHistory,
  getCandidateSummary,
  getCandidates,
  getCandidatesByJob,
  lookupApplicationStatus,
  getCandidateResumeData,
  parseCandidateResume,
  screenCandidate,
  updateRecruiterNote,
  updateCandidate,
  updateCandidateStatus,
  uploadCandidateByHR
} from "../controllers/candidateController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import {
  aiScreeningLimiter,
  publicApplicationLimiter,
  resumeUploadLimiter,
  statusLookupLimiter
} from "../middleware/rateLimitMiddleware.js";
import { handleResumeUploadErrors, resumeUpload } from "../middleware/resumeUploadMiddleware.js";
import { validate } from "../middleware/validationMiddleware.js";
import {
  candidateApplyParamsSchema,
  bulkAiScreeningSchema,
  bulkCandidateActionSchema,
  candidateIdParamsSchema,
  candidateExportQuerySchema,
  candidateJobParamsSchema,
  candidateListQuerySchema,
  candidateNoteParamsSchema,
  candidateStatusLookupSchema,
  candidateStatusUpdateSchema,
  candidateUpdateSchema,
  compareCandidatesSchema,
  hrCandidateUploadSchema,
  parseResumeQuerySchema,
  recruiterNoteSchema,
  publicApplicationSchema
} from "../validations/candidateValidation.js";

const router = Router();

router.get("/status-lookup", statusLookupLimiter, validate(candidateStatusLookupSchema, "query"), lookupApplicationStatus);
router.post(
  "/apply/:jobSlug",
  publicApplicationLimiter,
  resumeUploadLimiter,
  validate(candidateApplyParamsSchema, "params"),
  (req, res, next) => resumeUpload(req, res, handleResumeUploadErrors(req, res, next)),
  validate(publicApplicationSchema),
  applyToJob
);

router.use(protect);
router.use(authorizeRoles("hr"));

router.post(
  "/upload/:jobId",
  resumeUploadLimiter,
  validate(candidateJobParamsSchema, "params"),
  (req, res, next) => resumeUpload(req, res, handleResumeUploadErrors(req, res, next)),
  validate(hrCandidateUploadSchema),
  uploadCandidateByHR
);
router.get("/", validate(candidateListQuerySchema, "query"), getCandidates);
router.get("/summary", getCandidateSummary);
router.get("/ai-summary", getCandidateAiSummary);
router.get("/export", validate(candidateExportQuerySchema, "query"), exportCandidates);
router.post("/bulk-actions", validate(bulkCandidateActionSchema), performBulkCandidateAction);
router.post("/bulk-ai-screen", aiScreeningLimiter, validate(bulkAiScreeningSchema), bulkScreenCandidates);
router.post("/compare", validate(compareCandidatesSchema), compareCandidates);
router.get("/job/:jobId", validate(candidateJobParamsSchema, "params"), validate(candidateListQuerySchema, "query"), getCandidatesByJob);
router.get("/:id", validate(candidateIdParamsSchema, "params"), getCandidateById);
router.post("/:id/parse-resume", resumeUploadLimiter, validate(candidateIdParamsSchema, "params"), validate(parseResumeQuerySchema, "query"), parseCandidateResume);
router.post("/:id/retry-resume-parsing", resumeUploadLimiter, validate(candidateIdParamsSchema, "params"), parseCandidateResume);
router.get("/:id/resume-data", validate(candidateIdParamsSchema, "params"), getCandidateResumeData);
router.post("/:id/ai-screen", aiScreeningLimiter, validate(candidateIdParamsSchema, "params"), validate(parseResumeQuerySchema, "query"), screenCandidate);
router.get("/:id/ai-evaluation", validate(candidateIdParamsSchema, "params"), getCandidateAiEvaluation);
router.post("/:id/notes", validate(candidateIdParamsSchema, "params"), validate(recruiterNoteSchema), addRecruiterNote);
router.put("/:id/notes/:noteId", validate(candidateNoteParamsSchema, "params"), validate(recruiterNoteSchema), updateRecruiterNote);
router.delete("/:id/notes/:noteId", validate(candidateNoteParamsSchema, "params"), deleteRecruiterNote);
router.put("/:id", validate(candidateIdParamsSchema, "params"), validate(candidateUpdateSchema), updateCandidate);
router.patch("/:id/status", validate(candidateIdParamsSchema, "params"), validate(candidateStatusUpdateSchema), updateCandidateStatus);
router.delete("/:id", validate(candidateIdParamsSchema, "params"), deleteCandidate);
router.get("/:id/status-history", validate(candidateIdParamsSchema, "params"), getCandidateStatusHistory);
router.get("/:id/resume", validate(candidateIdParamsSchema, "params"), downloadOrPreviewResume);

export default router;
