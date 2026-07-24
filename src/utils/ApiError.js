class ApiError extends Error {
  constructor(statusCode, message = "Something went wrong", errors = [], isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.message = message;
    this.errors = errors;
    this.isOperational = isOperational;
    this.success = false;

    Error.captureStackTrace(this, this.constructor);
  }
}

export default ApiError;
