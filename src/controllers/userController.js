import env from "../config/env.js";
import Company from "../models/Company.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

const clearRefreshCookie = (res) => {
  res.clearCookie("hiresmart_refresh_token", {
    httpOnly: true,
    secure: env.cookieSecure || env.nodeEnv === "production",
    sameSite: env.cookieSameSite,
    path: "/api/v1/auth"
  });
};

export const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  const company = user?.companyId ? await Company.findById(user.companyId) : null;

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  res.status(200).json(
    new ApiResponse(200, "Profile fetched", {
      user: user.toSafeObject(),
      company: company ? company.toSafeObject() : null
    })
  );
});

export const updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const allowedFields = ["name", "phone", "profileImage"];

  allowedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      user[field] = req.body[field];
    }
  });

  await user.save({ validateBeforeSave: true });

  res.status(200).json(
    new ApiResponse(200, "Profile updated", {
      user: user.toSafeObject()
    })
  );
});

export const uploadProfileImage = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  user.profileImage = `/uploads/images/profiles/${req.file.filename}`;
  await user.save({ validateBeforeSave: true });

  res.status(200).json(
    new ApiResponse(200, "Profile image uploaded", {
      user: user.toSafeObject()
    })
  );
});

export const changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select(
    "+password +refreshTokenHash +resetPasswordToken +resetPasswordExpire"
  );

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const matchesCurrentPassword = await user.comparePassword(req.body.currentPassword);

  if (!matchesCurrentPassword) {
    throw new ApiError(400, "Current password is incorrect");
  }

  if (await user.comparePassword(req.body.newPassword)) {
    throw new ApiError(400, "New password must be different from current password");
  }

  user.password = req.body.newPassword;
  user.refreshTokenHash = undefined;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  clearRefreshCookie(res);

  res.status(200).json(
    new ApiResponse(200, "Password changed successfully. Please log in again.")
  );
});
