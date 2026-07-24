import ApiError from "../utils/ApiError.js";

export const validate = (schema, source = "body") => (req, _res, next) => {
  const parsed = schema.safeParse(req[source] || {});

  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message
    }));

    return next(new ApiError(400, "Validation failed", errors));
  }

  req[source] = parsed.data;
  return next();
};
