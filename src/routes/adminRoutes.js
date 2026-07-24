import { Router } from "express";
import {
  getAdminOverview,
  getCompanyDetails,
  getSystemHealthStatus,
  getUserDetails,
  listAuditLogs,
  listCompanies,
  listUsers,
  updateCompanyStatus,
  updateUserStatus
} from "../controllers/adminController.js";
import { protect } from "../middleware/authMiddleware.js";
import { adminLimiter } from "../middleware/rateLimitMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { validate } from "../middleware/validationMiddleware.js";
import { accountStatusUpdateSchema, adminIdParamsSchema, adminListQuerySchema } from "../validations/analyticsValidation.js";

const router = Router();

router.use(adminLimiter);
router.use(protect);
router.use(authorizeRoles("admin"));

router.get("/analytics/overview", getAdminOverview);
router.get("/companies", validate(adminListQuerySchema, "query"), listCompanies);
router.get("/companies/:id", validate(adminIdParamsSchema, "params"), getCompanyDetails);
router.patch("/companies/:id/status", validate(adminIdParamsSchema, "params"), validate(accountStatusUpdateSchema), updateCompanyStatus);
router.get("/users", validate(adminListQuerySchema, "query"), listUsers);
router.get("/users/:id", validate(adminIdParamsSchema, "params"), getUserDetails);
router.patch("/users/:id/status", validate(adminIdParamsSchema, "params"), validate(accountStatusUpdateSchema), updateUserStatus);
router.get("/audit-logs", validate(adminListQuerySchema, "query"), listAuditLogs);
router.get("/system-health", getSystemHealthStatus);

export default router;
