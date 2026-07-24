import User from "../models/User.js";
import Company from "../models/Company.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { verifyAccessToken } from "../utils/generateToken.js";

export const protect = asyncHandler(async (req, _res, next) => {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new ApiError(401, "Authentication token is required");
  }

  let decoded;

  try {
    decoded = verifyAccessToken(token);
  } catch {
    throw new ApiError(401, "Invalid or expired authentication token");
  }

  if (decoded.tokenType === "refresh") {
    throw new ApiError(401, "Invalid authentication token");
  }

  const user = await User.findById(decoded.userId);

  if (!user) {
    throw new ApiError(401, "User no longer exists");
  }

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

  req.user = user.toSafeObject();
  next();
});
