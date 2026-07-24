import crypto from "crypto";

export const requestContextMiddleware = (req, res, next) => {
  const incomingRequestId = req.headers["x-request-id"];
  const requestId =
    typeof incomingRequestId === "string" && /^[A-Za-z0-9._:-]{8,128}$/.test(incomingRequestId)
      ? incomingRequestId
      : crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);
  next();
};
