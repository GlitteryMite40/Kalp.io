export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode = 500,
    code = "INTERNAL_SERVER_ERROR",
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class BadRequestError extends ApiError {
  constructor(
    message = "Bad request",
    details?: unknown,
    code = "BAD_REQUEST",
  ) {
    super(message, 400, code, details);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Unauthorized", details?: unknown) {
    super(message, 401, "UNAUTHORIZED", details);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "Forbidden", details?: unknown) {
    super(message, 403, "FORBIDDEN", details);
  }
}

export class ConflictError extends ApiError {
  constructor(message = "Conflict", details?: unknown) {
    super(message, 409, "CONFLICT", details);
  }
}

export class TooManyRequestsError extends ApiError {
  constructor(message = "Too many requests", details?: unknown) {
    super(message, 429, "TOO_MANY_REQUESTS", details);
  }
}

export class BadGatewayError extends ApiError {
  constructor(message = "Bad gateway", details?: unknown) {
    super(message, 502, "BAD_GATEWAY", details);
  }
}
