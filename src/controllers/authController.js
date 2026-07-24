import crypto from "crypto";
import env, { isDevelopment } from "../config/env.js";
import Company from "../models/Company.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenMaxAge,
  verifyRefreshToken
} from "../utils/generateToken.js";
import { hashToken } from "../utils/hashToken.js";

const REFRESH_COOKIE_NAME = "hiresmart_refresh_token";

const getRefreshCookieOptions = () => ({
  httpOnly: true,
  secure: env.cookieSecure || env.nodeEnv === "production",
  sameSite: env.cookieSameSite,
  path: "/api/v1/auth",
  maxAge: getRefreshTokenMaxAge()
});

const setRefreshCookie = (res, refreshToken) => {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions());
};

const clearRefreshCookie = (res) => {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    ...getRefreshCookieOptions(),
    maxAge: undefined
  });
};

const issueTokens = async (user, res) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  user.refreshTokenHash = hashToken(refreshToken);
  await user.save({ validateBeforeSave: false });
  setRefreshCookie(res, refreshToken);

  return accessToken;
};

const ensureLoginAllowed = async (user) => {
  const accountStatus = user.accountStatus || (user.isActive ? "Active" : "Disabled");
  if (!user.isActive || accountStatus !== "Active") {
    throw new ApiError(403, "Account is not active");
  }

  if (user.role === "hr" && user.companyId) {
    const company = await Company.findById(user.companyId).select("isActive accountStatus");
    const companyStatus = company?.accountStatus || (company?.isActive ? "Active" : "Disabled");
    if (!company || !company.isActive || companyStatus !== "Active") {
      throw new ApiError(403, "Company account is not active");
    }
  }
};

export const register = asyncHandler(async (req, res) => {
  const { name, email, phone, password, role } = req.body;

  if (role && role !== "hr") {
    throw new ApiError(400, "Admin accounts cannot be created through public registration");
  }

  const existingUser = await User.findOne({ email });

  if (existingUser) {
    throw new ApiError(409, "An account with this email already exists");
  }

  const user = await User.create({
    name,
    email,
    phone,
    password,
    role: "hr"
  });

  const accessToken = await issueTokens(user, res);

  res.status(201).json(
    new ApiResponse(201, "Registration successful", {
      user: user.toSafeObject(),
      accessToken
    })
  );
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select("+password +refreshTokenHash");

  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, "Invalid email or password");
  }

  await ensureLoginAllowed(user);

  user.lastLoginAt = new Date();
  const accessToken = await issueTokens(user, res);

  res.status(200).json(
    new ApiResponse(200, "Login successful", {
      user: user.toSafeObject(),
      accessToken
    })
  );
});

export const refreshAccessToken = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

  if (!refreshToken) {
    throw new ApiError(401, "Refresh token is required");
  }

  let decoded;

  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  if (decoded.tokenType !== "refresh") {
    throw new ApiError(401, "Invalid refresh token");
  }

  const user = await User.findById(decoded.userId).select("+refreshTokenHash");

  if (!user || !user.refreshTokenHash || user.refreshTokenHash !== hashToken(refreshToken)) {
    throw new ApiError(401, "Invalid refresh token");
  }

  await ensureLoginAllowed(user);

  const accessToken = await issueTokens(user, res);

  res.status(200).json(
    new ApiResponse(200, "Token refreshed", {
      user: user.toSafeObject(),
      accessToken
    })
  );
});

export const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

  if (refreshToken) {
    try {
      const decoded = verifyRefreshToken(refreshToken);
      const user = await User.findById(decoded.userId).select("+refreshTokenHash");

      if (user && user.refreshTokenHash === hashToken(refreshToken)) {
        user.refreshTokenHash = undefined;
        await user.save({ validateBeforeSave: false });
      }
    } catch {
      // Logout should still clear the cookie when the refresh token is missing or invalid.
    }
  }

  clearRefreshCookie(res);
  res.status(200).json(new ApiResponse(200, "Logout successful"));
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email }).select("+resetPasswordToken +resetPasswordExpire");
  let developmentResetUrl = null;

  if (user) {
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = hashToken(resetToken);
    user.resetPasswordExpire = new Date(Date.now() + env.resetPasswordExpireMinutes * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    if (isDevelopment) {
      developmentResetUrl = `${env.clientUrl}/reset-password/${resetToken}`;
    }
  }

  res.status(200).json(
    new ApiResponse(200, "If an account exists, password reset instructions are available.", {
      ...(developmentResetUrl
        ? {
            developmentOnly: {
              resetUrl: developmentResetUrl
            }
          }
        : {})
    })
  );
});

export const resetPassword = asyncHandler(async (req, res) => {
  const resetTokenHash = hashToken(req.params.token);
  const user = await User.findOne({
    resetPasswordToken: resetTokenHash,
    resetPasswordExpire: { $gt: new Date() }
  }).select("+resetPasswordToken +resetPasswordExpire +refreshTokenHash +password");

  if (!user) {
    throw new ApiError(400, "Reset token is invalid or expired");
  }

  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  user.refreshTokenHash = undefined;
  await user.save();

  res.status(200).json(new ApiResponse(200, "Password reset successful"));
});

export const getCurrentUser = asyncHandler(async (req, res) => {
  res.status(200).json(
    new ApiResponse(200, "Current user fetched", {
      user: req.user
    })
  );
});
