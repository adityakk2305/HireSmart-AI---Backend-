import { Router } from "express";
import {
  forgotPassword,
  getCurrentUser,
  login,
  logout,
  refreshAccessToken,
  register,
  resetPassword
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";
import {
  authLimiter,
  forgotPasswordLimiter,
  loginLimiter,
  registerLimiter
} from "../middleware/rateLimitMiddleware.js";
import { validate } from "../middleware/validationMiddleware.js";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema
} from "../validations/authValidation.js";

const router = Router();

router.post("/register", registerLimiter, validate(registerSchema), register);
router.post("/login", loginLimiter, validate(loginSchema), login);
router.post("/refresh-token", authLimiter, refreshAccessToken);
router.post("/logout", authLimiter, logout);
router.post("/forgot-password", forgotPasswordLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password/:token", forgotPasswordLimiter, validate(resetPasswordSchema), resetPassword);
router.get("/me", protect, getCurrentUser);

export default router;
