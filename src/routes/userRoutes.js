import { Router } from "express";
import {
  changePassword,
  getProfile,
  updateProfile,
  uploadProfileImage
} from "../controllers/userController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { handleUploadErrors, profileImageUpload } from "../middleware/uploadMiddleware.js";
import { validate } from "../middleware/validationMiddleware.js";
import { changePasswordSchema, updateProfileSchema } from "../validations/userValidation.js";

const router = Router();

router.use(protect);
router.use(authorizeRoles("admin", "hr"));

router.get("/profile", getProfile);
router.put("/profile", validate(updateProfileSchema), updateProfile);
router.put("/change-password", validate(changePasswordSchema), changePassword);
router.post("/profile-image", (req, res, next) => {
  profileImageUpload(req, res, handleUploadErrors(req, res, next));
}, uploadProfileImage);

export default router;
