import { Router } from "express";
import {
  changeJobStatus,
  createJob,
  deleteJob,
  getJobById,
  getJobSummary,
  getJobs,
  getPublicJobBySlug,
  updateJob
} from "../controllers/jobController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { validate } from "../middleware/validationMiddleware.js";
import {
  changeJobStatusSchema,
  createJobSchema,
  jobIdParamsSchema,
  jobListQuerySchema,
  publicSlugParamsSchema,
  updateJobSchema
} from "../validations/jobValidation.js";

const router = Router();

router.get("/public/:slug", validate(publicSlugParamsSchema, "params"), getPublicJobBySlug);

router.use(protect);
router.use(authorizeRoles("hr"));

router.post("/", validate(createJobSchema), createJob);
router.get("/", validate(jobListQuerySchema, "query"), getJobs);
router.get("/summary", getJobSummary);
router.get("/:id", validate(jobIdParamsSchema, "params"), getJobById);
router.put("/:id", validate(jobIdParamsSchema, "params"), validate(updateJobSchema), updateJob);
router.delete("/:id", validate(jobIdParamsSchema, "params"), deleteJob);
router.patch("/:id/status", validate(jobIdParamsSchema, "params"), validate(changeJobStatusSchema), changeJobStatus);

export default router;
