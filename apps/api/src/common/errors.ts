import { HttpException, HttpStatus } from '@nestjs/common';

/** The one error type services throw. Serialised as { code, message, fieldErrors }. */
export class AppError extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super({ code, message, fieldErrors }, status);
  }
}

export const notFound = (what: string) => new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} not found`);
export const conflict = (code: string, message: string) => new AppError(HttpStatus.CONFLICT, code, message);
export const invalid = (message: string, fieldErrors?: Record<string, string>) =>
  new AppError(HttpStatus.UNPROCESSABLE_ENTITY, 'VALIDATION', message, fieldErrors);
export const forbidden = (message = 'You do not have access to this') =>
  new AppError(HttpStatus.FORBIDDEN, 'FORBIDDEN', message);
