import { HttpException, HttpStatus } from '@nestjs/common';

/** Domain error with a stable machine-readable code. */
export class AppError extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

export const Errors = {
  notFound: (entity: string) => new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${entity} not found`),
  forbidden: (message = 'You do not have permission to perform this action') =>
    new AppError(HttpStatus.FORBIDDEN, 'FORBIDDEN', message),
  unauthorized: (message = 'Authentication required') => new AppError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', message),
  conflict: (code: string, message: string, details?: unknown) => new AppError(HttpStatus.CONFLICT, code, message, details),
  badRequest: (code: string, message: string, details?: unknown) =>
    new AppError(HttpStatus.BAD_REQUEST, code, message, details),
  unprocessable: (code: string, message: string, details?: unknown) =>
    new AppError(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details),
  serviceUnavailable: (code: string, message: string) => new AppError(HttpStatus.SERVICE_UNAVAILABLE, code, message),
  planLimit: (message: string) => new AppError(HttpStatus.PAYMENT_REQUIRED, 'PLAN_LIMIT_REACHED', message),
};
