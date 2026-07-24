import { Router } from "express";
import {
  exportReport,
  getAiScreening,
  getCandidateSources,
  getCandidates,
  getEmails,
  getHiringFunnel,
  getInterviewers,
  getInterviews,
  getJobDetails,
  getJobs,
  getOverview,
  getRecruiters,
  getSkills,
  getSummary
} from "../controllers/analyticsController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { analyticsLimiter } from "../middleware/rateLimitMiddleware.js";
import { validate } from "../middleware/validationMiddleware.js";
import {
  analyticsExportQuerySchema,
  analyticsJobQuerySchema,
  analyticsQuerySchema,
  jobAnalyticsParamsSchema
} from "../validations/analyticsValidation.js";

const router = Router();

router.use(analyticsLimiter);
router.use(protect);
router.use(authorizeRoles("hr"));

router.get("/summary", validate(analyticsQuerySchema, "query"), getSummary);
router.get("/overview", validate(analyticsQuerySchema, "query"), getOverview);
router.get("/hiring-funnel", validate(analyticsQuerySchema, "query"), getHiringFunnel);
router.get("/candidates", validate(analyticsQuerySchema, "query"), getCandidates);
router.get("/candidate-sources", validate(analyticsQuerySchema, "query"), getCandidateSources);
router.get("/ai-screening", validate(analyticsQuerySchema, "query"), getAiScreening);
router.get("/skills", validate(analyticsQuerySchema, "query"), getSkills);
router.get("/jobs", validate(analyticsJobQuerySchema, "query"), getJobs);
router.get("/jobs/:jobId", validate(jobAnalyticsParamsSchema, "params"), validate(analyticsQuerySchema, "query"), getJobDetails);
router.get("/interviews", validate(analyticsQuerySchema, "query"), getInterviews);
router.get("/interviewers", validate(analyticsQuerySchema, "query"), getInterviewers);
router.get("/emails", validate(analyticsQuerySchema, "query"), getEmails);
router.get("/recruiters", validate(analyticsQuerySchema, "query"), getRecruiters);
router.get("/export", validate(analyticsExportQuerySchema, "query"), exportReport);

export default router;
