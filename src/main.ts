import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import express from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './lib/auth';
import type { NextFunction, Request, Response } from 'express';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { buildApiErrorBody } from './common/errors/error-response';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { addBetterAuthPaths } from './docs/better-auth.openapi';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false, // Required for Better Auth
  });

  // Mount Better Auth before JSON body parsing middleware.
  const server = app.getHttpAdapter().getInstance();
  // Use a prefix mount (no wildcard) to avoid path-to-regexp errors.
  server.use('/api/auth', toNodeHandler(auth));

  // Enable body parsing for the REST API routes.
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Centralized error handling for Nest routes.
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerEnabled = process.env.NODE_ENV !== 'production';

  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Fueled Forward API')
      .setDescription('Fueled Forward REST API')
      .setVersion('0.0.1')
      .addCookieAuth('better-auth.session_token', {
        type: 'apiKey',
        in: 'cookie',
        name: 'better-auth.session_token',
      })
      .build();

    const document = SwaggerModule.createDocument(app, config);
    addBetterAuthPaths(document, { basePath: '/api/auth' });
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        withCredentials: true,
      },
    });
  }

  // Ensure all Nest routes are registered before adding Express error middleware.
  await app.init();

  // Centralized error handling for non-Nest Express routes (e.g. Better Auth).
  server.use(
    (err: unknown, req: Request, res: Response, next: NextFunction) => {
      if (!err) return next();

      // Central logging for non-Nest (Express) errors.
      // Keep it simple: log the raw error in non-prod.
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.error('Express error:', err);
      }

      const statusCode =
        typeof (err as { status?: unknown }).status === 'number'
          ? ((err as { status: number }).status as number)
          : typeof (err as { statusCode?: unknown }).statusCode === 'number'
            ? ((err as { statusCode: number }).statusCode as number)
            : 500;

      const isProd = process.env.NODE_ENV === 'production';
      const message = isProd
        ? 'Internal server error'
        : err instanceof Error
          ? err.message
          : String(err);

      return res.status(statusCode).json(
        buildApiErrorBody({
          statusCode,
          message,
          error: 'Error',
          path: req.originalUrl ?? req.url,
        }),
      );
    },
  );

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
