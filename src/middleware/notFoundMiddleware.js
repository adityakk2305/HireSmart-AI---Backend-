import ApiError from "../utils/ApiError.js";

export const notFoundMiddleware = (req, _res, next) => {
  next(new ApiError(404, `Route not found: ${req.originalUrl}`));
};
