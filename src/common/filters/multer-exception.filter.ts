import { Catch } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { MulterError } from 'multer';
import { getMaxAvatarUploadBytes } from 'src/media/media-upload.validation';

@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<{
      status: (code: number) => any;
      json: (body: unknown) => any;
    }>();

    const statusCode = 400;

    let message = exception.message;
    if (exception.code === 'LIMIT_FILE_SIZE') {
      const maxBytes = getMaxAvatarUploadBytes();
      message = `File too large. Max size is ${Math.round(maxBytes / (1024 * 1024))}MB.`;
    } else if (exception.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Unexpected file field. Expected field name: file.';
    }

    return res.status(statusCode).json({
      statusCode,
      message,
      error: 'Bad Request',
    });
  }
}
