import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import { AppException } from '../exceptions/app.exception';
import * as Sentry from '@sentry/node';
import { v4 as uuid } from 'uuid';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let statusCode = 500;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'An error occurred.';
    let details: Record<string, any> | undefined;

    if (exception instanceof AppException) {
      statusCode = exception.statusCode;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const resp = exception.getResponse() as any;
      code = resp?.code || 'HTTP_EXCEPTION';
      message = resp?.message || exception.message;
    } else if (exception?.code === 'LIMIT_FILE_SIZE') {
      statusCode = 413;
      code = 'PAYLOAD_TOO_LARGE';
      message = 'Uploaded files must be 10 MB or smaller.';
    } else if (
      exception?.code === 'LIMIT_FILE_COUNT' ||
      exception?.code === 'LIMIT_UNEXPECTED_FILE'
    ) {
      statusCode = 400;
      code = 'INVALID_FILE_COUNT';
      message = 'Upload one file at a time.';
    } else if (exception.code === 'P2002') {
      // Prisma unique constraint
      statusCode = 409;
      code = 'RESOURCE_CONFLICT';
      message = 'Resource already exists.';
    }

    const requestId = request.id || uuid();

    if (statusCode >= 500) {
      Sentry.captureException(exception, {
        tags: { requestId, statusCode: String(statusCode) },
        extra: {
          method: request.method,
          route: request.route?.path ?? 'unmatched',
        },
      });
    }

    const errorEnvelope = {
      code,
      message,
      requestId,
      timestamp: new Date().toISOString(),
      ...(details && { details }),
    };

    response.status(statusCode).json(errorEnvelope);
  }
}
