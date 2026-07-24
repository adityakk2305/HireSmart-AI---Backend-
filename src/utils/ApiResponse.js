class ApiResponse {
  constructor(statusCode, message = "Success", data = null, meta = null) {
    this.success = statusCode < 400;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;

    if (meta) {
      this.meta = meta;
    }
  }
}

export default ApiResponse;
