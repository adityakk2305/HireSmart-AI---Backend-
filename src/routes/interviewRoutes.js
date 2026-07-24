import { Router } from "express";
import {
  addFeedback,
  cancelInterview,
  completeInterview,
  createInterview,
  generateInterviewQuestions,
  getCandidateInterviews,
  getInterviewById,
  getInterviews,
  getInterviewSummary,
  getTodayInterviews,
  getUpcomingInterviews,
  rescheduleInterview,
  updateFeedback,
  updateInterview,
  updateInterviewStatus
} from "../controllers/interviewController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { interviewGenerationLimiter } from "../middleware/rateLimitMiddleware.js";
import { validate } from "../middleware/validationMiddleware.js";
import {
  cancelInterviewSchema,
  candidateInterviewParamsSchema,
  createInterviewSchema,
  feedbackParamsSchema,
  feedbackSchema,
  generateQuestionsSchema,
  interviewIdParamsSchema,
  interviewListQuerySchema,
  interviewStatusUpdateSchema,
  rescheduleInterviewSchema,
  updateInterviewSchema
} from "../validations/interviewValidation.js";

const router = Router();

router.use(protect, authorizeRoles("hr"));

router.post("/", validate(createInterviewSchema), createInterview);
router.get("/", validate(interviewListQuerySchema, "query"), getInterviews);
router.get("/summary", getInterviewSummary);
router.get("/upcoming", getUpcomingInterviews);
router.get("/today", getTodayInterviews);
router.get("/candidate/:candidateId", validate(candidateInterviewParamsSchema, "params"), getCandidateInterviews);
router.post("/:id/generate-questions", interviewGenerationLimiter, validate(interviewIdParamsSchema, "params"), validate(generateQuestionsSchema), generateInterviewQuestions);
router.post("/:id/feedback", validate(interviewIdParamsSchema, "params"), validate(feedbackSchema), addFeedback);
router.put("/:id/feedback/:feedbackId", validate(feedbackParamsSchema, "params"), validate(feedbackSchema), updateFeedback);
router.patch("/:id/reschedule", validate(interviewIdParamsSchema, "params"), validate(rescheduleInterviewSchema), rescheduleInterview);
router.patch("/:id/cancel", validate(interviewIdParamsSchema, "params"), validate(cancelInterviewSchema), cancelInterview);
router.patch("/:id/status", validate(interviewIdParamsSchema, "params"), validate(interviewStatusUpdateSchema), updateInterviewStatus);
router.patch("/:id/complete", validate(interviewIdParamsSchema, "params"), completeInterview);
router.get("/:id", validate(interviewIdParamsSchema, "params"), getInterviewById);
router.put("/:id", validate(interviewIdParamsSchema, "params"), validate(updateInterviewSchema), updateInterview);

export default router;
