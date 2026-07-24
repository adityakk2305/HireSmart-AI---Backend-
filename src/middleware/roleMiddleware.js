import ApiError from "../utils/ApiError.js";

export const authorizeRoles =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) {
      return next(new ApiError(401, "Authentication is required"));
    }

    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, "You do not have permission to access this resource"));
    }

    return next();
  };
