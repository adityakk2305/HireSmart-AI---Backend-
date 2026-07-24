import { Router } from "express";
import {
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  getTemplateById,
  getTemplates,
  previewTemplate,
  resetDefaultTemplate,
  updateTemplate
} from "../controllers/emailTemplateController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { validate } from "../middleware/validationMiddleware.js";
import {
  emailPreviewSchema,
  emailTemplatePayloadSchema,
  emailTemplateUpdateSchema,
  idParamsSchema,
  templateListQuerySchema
} from "../validations/emailValidation.js";

const router = Router();

router.use(protect, authorizeRoles("hr"));

router.post("/", validate(emailTemplatePayloadSchema), createTemplate);
router.get("/", validate(templateListQuerySchema, "query"), getTemplates);
router.post("/preview", validate(emailPreviewSchema), previewTemplate);
router.get("/:id", validate(idParamsSchema, "params"), getTemplateById);
router.put("/:id", validate(idParamsSchema, "params"), validate(emailTemplateUpdateSchema), updateTemplate);
router.post("/:id/duplicate", validate(idParamsSchema, "params"), duplicateTemplate);
router.post("/:id/reset", validate(idParamsSchema, "params"), resetDefaultTemplate);
router.delete("/:id", validate(idParamsSchema, "params"), deleteTemplate);

export default router;
