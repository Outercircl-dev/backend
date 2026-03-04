import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type {
  ErrorDetail,
  StandardErrorResponse,
} from '../interfaces/standard-error-response.interface';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    const { message, details } = this.normalizeMessageAndDetails(
      exceptionResponse,
      status,
    );

    const payload: StandardErrorResponse = {
      statusCode: status,
      message,
      path: request.url,
      details,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(payload);
  }

  private normalizeMessageAndDetails(
    exceptionResponse: unknown,
    status: number,
  ): { message: string; details: ErrorDetail[] } {
    if (typeof exceptionResponse === 'string') {
      return { message: exceptionResponse, details: [] };
    }

    if (
      exceptionResponse &&
      typeof exceptionResponse === 'object' &&
      'message' in exceptionResponse
    ) {
      const source = exceptionResponse as {
        message?: string | string[];
        details?: ErrorDetail[];
      };
      const messages = Array.isArray(source.message)
        ? source.message
        : source.message
          ? [source.message]
          : [];
      const details =
        source.details && source.details.length > 0
          ? source.details
          : messages.map((item, index) => ({
              field: 'request',
              code: `error_${index + 1}`,
              message: item,
            }));

      return {
        message:
          messages[0] ??
          (status >= 500 ? 'Internal server error' : 'Request failed'),
        details,
      };
    }

    return {
      message: status >= 500 ? 'Internal server error' : 'Request failed',
      details: [],
    };
  }
}
