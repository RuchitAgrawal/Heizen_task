import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ApiErrorBody } from '@fernleaf/shared';
import type { Response } from 'express';

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly log = new Logger('Error');

  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const [status, body] = this.toBody(err);
    if (status >= 500) this.log.error(err instanceof Error ? err.stack : String(err));
    res.status(status).json(body);
  }

  private toBody(err: unknown): [number, ApiErrorBody] {
    if (err instanceof HttpException) {
      const r = err.getResponse();
      if (typeof r === 'object' && r && 'code' in r) return [err.getStatus(), r as ApiErrorBody];
      const message = typeof r === 'string' ? r : ((r as { message?: string }).message ?? err.message);
      return [err.getStatus(), { code: HttpStatus[err.getStatus()] ?? 'ERROR', message: String(message) }];
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        const fields = ((err.meta?.target as string[] | undefined) ?? []).filter((f) => f !== 'id');
        const fieldErrors = Object.fromEntries(fields.map((f) => [f, 'Already in use']));
        return [409, { code: 'DUPLICATE', message: `Already exists: ${fields.join(', ') || 'value'}`, fieldErrors }];
      }
      if (err.code === 'P2025') return [404, { code: 'NOT_FOUND', message: 'Record not found' }];
      if (err.code === 'P2003') return [409, { code: 'IN_USE', message: 'Referenced record is missing or still in use' }];
    }
    return [500, { code: 'INTERNAL', message: 'Something went wrong. Try again.' }];
  }
}
