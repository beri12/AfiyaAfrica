import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import type { ApiErrorBody } from '@afyalink/shared';
import { RequestContext } from '../context/request-context';

interface Mapped {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

function mapPrisma(e: unknown): Mapped | undefined {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') return { status: 409, code: 'DUPLICATE', message: 'A record with these details already exists' };
    if (e.code === 'P2025') return { status: 404, code: 'NOT_FOUND', message: 'Record not found' };
    if (e.code === 'P2003') return { status: 409, code: 'REFERENCE_CONFLICT', message: 'Related record constraint failed' };
  }
  const msg = e instanceof Error ? e.message : '';
  if (msg.includes('Appointment_no_doctor_overlap') || msg.includes('23P01')) {
    return { status: 409, code: 'APPOINTMENT_CONFLICT', message: 'The doctor already has an appointment at this time' };
  }
  return undefined;
}

/** Normalises every error to `{ error: { code, message, details?, requestId } }` and never leaks internals. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const requestId = RequestContext.get()?.requestId;
    let mapped: Mapped;

    if (exception instanceof ThrottlerException) {
      mapped = { status: 429, code: 'RATE_LIMITED', message: 'Too many requests, please slow down' };
    } else if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body && 'code' in body) {
        const b = body as { code: string; message: string; details?: unknown };
        mapped = { status, code: b.code, message: b.message, details: b.details };
      } else {
        const message = typeof body === 'string' ? body : ((body as { message?: string }).message ?? exception.message);
        mapped = { status, code: HttpStatus[status] ?? 'ERROR', message: Array.isArray(message) ? message.join('; ') : message };
      }
    } else {
      mapped = mapPrisma(exception) ?? {
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      };
    }

    if (mapped.status >= 500) {
      this.logger.error({ err: exception, requestId }, 'Unhandled error');
    }

    const payload: ApiErrorBody = {
      error: { code: mapped.code, message: mapped.message, requestId, ...(mapped.details ? { details: mapped.details } : {}) },
    };
    res.status(mapped.status).json(payload);
  }
}
