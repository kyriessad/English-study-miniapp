class AppError extends Error {
  constructor(message, options = {}) {
    super(message || '请求失败');
    this.name = 'AppError';
    this.code = options.code || 'REQUEST_FAILED';
    this.statusCode = Number(options.statusCode || 0);
    this.data = options.data === undefined ? null : options.data;
    this.retryable = options.retryable === undefined
      ? this.statusCode === 0 || this.statusCode >= 500
      : Boolean(options.retryable);
    this.cause = options.cause;
  }

  static from(error, fallbackMessage = '请求失败') {
    if (error instanceof AppError) return error;

    const statusCode = Number(error && error.statusCode || 0);
    const data = error && error.data !== undefined ? error.data : null;
    const detail = data && typeof data.detail === 'string' ? data.detail : '';
    const message = detail || (error && error.errMsg) || (error && error.message) || fallbackMessage;

    return new AppError(message, {
      code: AppError.codeFor(statusCode, data),
      statusCode,
      data,
      retryable: AppError.isRetryable(statusCode, data),
      cause: error
    });
  }

  static codeFor(statusCode, data) {
    if (statusCode === 401) return 'UNAUTHENTICATED';
    if (statusCode === 403) return 'FORBIDDEN';
    if (statusCode === 404) return 'NOT_FOUND';
    if (statusCode === 409) return 'CONFLICT';
    if (statusCode >= 500) return 'SERVER_ERROR';
    if (statusCode === 0 || statusCode === -1) return 'NETWORK_ERROR';
    if (data && data.detail) return 'BUSINESS_ERROR';
    return 'REQUEST_FAILED';
  }

  static isRetryable(statusCode) {
    return statusCode === 0 || statusCode === -1 || statusCode >= 500;
  }
}

module.exports = { AppError };
