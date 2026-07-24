import { Router } from "express";
import {
  cancelEmailLog,
  getEmailLogById,
  getEmailLogs,
  getEmailSettings,
  getEmailSummary,
  retryEmailLog,
  sendBulkCandidateEmails,
  sendCandidateStatusEmail,
  sendInterviewCancelledEmail,
  sendInterviewInvitation,
  sendInterviewReminder,
  sendInterviewRescheduledEmail,
  sendManualCandidateEmail,
  sendTestConfigurationEmail,
  updateEmailSettings,
  verifyConfiguration
} from "../controllers/emailController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { validate } from "../middleware/validationMiddleware.js";
import { emailSendingLimiter, forgotPasswordLimiter } from "../middleware/rateLimitMiddleware.js";
import {
  automationSendSchema,
  bulkCandidateEmailSchema,
  candidateEmailParamsSchema,
  candidateStatusEmailSchema,
  emailListQuerySchema,
  emailLogIdParamsSchema,
  emailSettingsSchema,
  interviewEmailParamsSchema,
  manualCandidateEmailSchema,
  sendTestEmailSchema
} from "../validations/emailValidation.js";

const router = Router();

router.use(protect, authorizeRoles("hr"));

router.get("/summary", getEmailSummary);
router.get("/settings", getEmailSettings);
router.put("/settings", validate(emailSettingsSchema), updateEmailSettings);
router.post("/verify", forgotPasswordLimiter, verifyConfiguration);
router.post("/test", forgotPasswordLimiter, validate(sendTestEmailSchema), sendTestConfigurationEmail);
router.get("/logs", validate(emailListQuerySchema, "query"), getEmailLogs);
router.get("/logs/:id", validate(emailLogIdParamsSchema, "params"), getEmailLogById);
router.post("/logs/:id/retry", validate(emailLogIdParamsSchema, "params"), retryEmailLog);
router.post("/logs/:id/cancel", validate(emailLogIdParamsSchema, "params"), cancelEmailLog);
router.post("/manual-candidate", emailSendingLimiter, validate(manualCandidateEmailSchema), sendManualCandidateEmail);
router.post("/bulk-candidates", emailSendingLimiter, validate(bulkCandidateEmailSchema), sendBulkCandidateEmails);
router.post("/candidates/:candidateId/status-email", emailSendingLimiter, validate(candidateEmailParamsSchema, "params"), validate(candidateStatusEmailSchema), sendCandidateStatusEmail);
router.post("/interviews/:interviewId/invitation", emailSendingLimiter, validate(interviewEmailParamsSchema, "params"), validate(automationSendSchema), sendInterviewInvitation);
router.post("/interviews/:interviewId/reminder", emailSendingLimiter, validate(interviewEmailParamsSchema, "params"), validate(automationSendSchema), sendInterviewReminder);
router.post("/interviews/:interviewId/rescheduled", emailSendingLimiter, validate(interviewEmailParamsSchema, "params"), validate(automationSendSchema), sendInterviewRescheduledEmail);
router.post("/interviews/:interviewId/cancelled", emailSendingLimiter, validate(interviewEmailParamsSchema, "params"), validate(automationSendSchema), sendInterviewCancelledEmail);

export default router;
