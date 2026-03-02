import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { buildApiErrorBody } from 'src/common/errors/error-response';

function normalizeHttpExceptionMessage(response: unknown): string | undefined {
  if (typeof response === 'string') return response;
  if (!response || typeof response !== 'object') return undefined;

  const maybeMessage = (response as { message?: unknown }).message;
  if (typeof maybeMessage === 'string') return maybeMessage;
  if (Array.isArray(maybeMessage)) return maybeMessage.map(String).join(', ');

  return undefined;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const path = req.originalUrl ?? req.url;
    const method = req.method;

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();

      const message =
        normalizeHttpExceptionMessage(response) ?? exception.message ?? 'Error';

      const error =
        (response &&
          typeof response === 'object' &&
          typeof (response as { error?: unknown }).error === 'string' &&
          ((response as { error?: string }).error as string)) ||
        exception.name;

      const details =
        response && typeof response === 'object' && response !== null
          ? response
          : undefined;

      const logLine = `${method} ${path} -> ${statusCode} ${message}`;
      if (statusCode >= 500) {
        this.logger.error(logLine, exception.stack);
      } else {
        this.logger.error(logLine);
      }

      return res.status(statusCode).json(
        buildApiErrorBody({
          statusCode,
          message,
          error,
          path,
          details,
        }),
      );
    }

    const statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    const isProd = process.env.NODE_ENV === 'production';

    const message = isProd
      ? 'Internal server error'
      : exception instanceof Error
        ? exception.message
        : String(exception);

    if (exception instanceof Error) {
      this.logger.error(`${method} ${path} -> 500 ${exception.message}`, exception.stack);
    } else {
      this.logger.error(`${method} ${path} -> 500 Non-Error thrown: ${String(exception)}`);
    }

    return res.status(statusCode).json(
      buildApiErrorBody({
        statusCode,
        message,
        error: 'Internal Server Error',
        path,
      }),
    );
  }
}

