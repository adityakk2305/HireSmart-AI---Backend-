import { Router } from "express";
import {
  createCompany,
  getAdminCompanySummary,
  getCompanyOnboardingStatus,
  getMyCompany,
  updateMyCompany,
  uploadCompanyLogo
} from "../controllers/companyController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { companyLogoUpload, handleUploadErrors } from "../middleware/uploadMiddleware.js";
import { validate } from "../middleware/validationMiddleware.js";
import { createCompanySchema, updateCompanySchema } from "../validations/companyValidation.js";

const router = Router();

router.use(protect);

router.get("/admin-summary", authorizeRoles("admin"), getAdminCompanySummary);
router.post("/", authorizeRoles("hr"), validate(createCompanySchema), createCompany);
router.get("/me", authorizeRoles("hr"), getMyCompany);
router.put("/me", authorizeRoles("hr"), validate(updateCompanySchema), updateMyCompany);
router.get("/onboarding-status", authorizeRoles("hr"), getCompanyOnboardingStatus);
router.post("/logo", authorizeRoles("hr"), (req, res, next) => {
  companyLogoUpload(req, res, handleUploadErrors(req, res, next));
}, uploadCompanyLogo);

export default router;
