import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Raised by the database trigger that enforces a closed month (see MonthClosingsBootstrap) —
    // surfaced as a clear, translated 400 instead of a raw 500.
    const closedMonth = exception instanceof Error ? /MONTH_CLOSED:(\d{4}-\d{2})/.exec(exception.message) : null;
    if (closedMonth) {
      response.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        path: request.url,
        timestamp: new Date().toISOString(),
        message: `شهر ${closedMonth[1]} مقفول — لا يمكن إضافة أو تعديل أو حذف أي عملية بتاريخ داخل هذا الشهر. اطلب من الأدمنستريتور فتح الشهر أولاً.`,
      });
      return;
    }

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    const message =
      exceptionResponse && typeof exceptionResponse === 'object'
        ? (exceptionResponse as any).message
        : exception instanceof Error
          ? exception.message
          : 'Internal server error';

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      message,
    });
  }
}
