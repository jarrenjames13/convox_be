import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApplicationException } from './application.exception';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const appError =
      exception instanceof ApplicationException ? exception : null;
    const payload =
      exception instanceof HttpException ? exception.getResponse() : null;
    const payloadObject =
      typeof payload === 'object' && payload !== null ? payload : {};
    const systemCodes: Readonly<Record<number, string>> = {
      400: 'VALIDATION_ERROR',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      429: 'RATE_LIMITED',
      502: 'UPSTREAM_ERROR',
      503: 'SERVICE_UNAVAILABLE',
    };
    const code =
      appError?.code ?? systemCodes[status] ?? 'INTERNAL_SERVER_ERROR';

    const message = appError
      ? appError.message
      : typeof payloadObject['message'] === 'string'
        ? payloadObject['message']
        : Array.isArray(payloadObject['message'])
          ? 'Request validation failed.'
          : status < 500 && typeof payload === 'string'
            ? payload
            : 'An unexpected error occurred.';

    if (status >= 500) {
      this.logger.error(`${request.method} ${request.path} failed (${status})`);
    }

    response.status(status).json({
      error: {
        code,
        message,
        details: appError?.details ?? null,
      },
    });
  }
}
