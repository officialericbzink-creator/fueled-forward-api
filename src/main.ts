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
import rateLimit from 'express-rate-limit';
import { RedisStore, type SendCommandFn } from 'rate-limit-redis';
import { createClient } from 'redis';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false, // Required for Better Auth
  });

  // Mount Better Auth before JSON body parsing middleware.
  const server = app.getHttpAdapter().getInstance();

  // In production (Railway / behind a reverse proxy), trust the first proxy hop
  // so Express can derive the real client IP for rate limiting.
  if (process.env.NODE_ENV === 'production') {
    server.set('trust proxy', 1);
  }

  let globalRedisStore: RedisStore | undefined;
  let authRedisStore: RedisStore | undefined;
  let uploadRedisStore: RedisStore | undefined;
  if (process.env.REDIS_URL) {
    try {
      const redisClient = createClient({ url: process.env.REDIS_URL });
      await redisClient.connect();

      const sendCommand: SendCommandFn = (...args: string[]) =>
        redisClient.sendCommand(args as any) as unknown as Promise<any>;

      // limiter must get its own store instance so windowMs/TTL
      globalRedisStore = new RedisStore({
        prefix: 'rl:http:global:',
        sendCommand,
      });
      authRedisStore = new RedisStore({
        prefix: 'rl:http:auth:',
        sendCommand,
      });
      uploadRedisStore = new RedisStore({
        prefix: 'rl:http:upload:',
        sendCommand,
      });
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.error('Rate limit Redis store init failed:', error);
      }
      globalRedisStore = undefined;
      authRedisStore = undefined;
      uploadRedisStore = undefined;
    }
  }

  // Rate limiting defaults
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
  const globalLimit = Number(process.env.RATE_LIMIT_GLOBAL_PER_WINDOW ?? 120);
  const authLimit = Number(process.env.RATE_LIMIT_AUTH_PER_WINDOW ?? 20);
  const uploadLimit = Number(process.env.RATE_LIMIT_UPLOAD_PER_WINDOW ?? 10);
  const uploadWindowMs = Number(
    process.env.RATE_LIMIT_UPLOAD_WINDOW_MS ?? 5 * 60_000,
  );

  const handler = (req: Request, res: Response) => {
    return res.status(429).json(
      buildApiErrorBody({
        statusCode: 429,
        message: 'Too many requests',
        error: 'Too Many Requests',
        path: req.originalUrl ?? req.url,
      }),
    );
  };

  const globalLimiter = rateLimit({
    windowMs,
    limit: globalLimit,
    standardHeaders: true,
    legacyHeaders: false,
    store: globalRedisStore,
    passOnStoreError: true,
    skip: (req) => {
      const url = req.originalUrl ?? req.url ?? '';
      return url.startsWith('/api/auth') || url.startsWith('/profile/avatar');
    },
    handler,
  });

  const authLimiter = rateLimit({
    windowMs,
    limit: authLimit,
    standardHeaders: true,
    legacyHeaders: false,
    store: authRedisStore,
    passOnStoreError: true,
    handler,
  });

  const uploadLimiter = rateLimit({
    windowMs: uploadWindowMs,
    limit: uploadLimit,
    standardHeaders: true,
    legacyHeaders: false,
    store: uploadRedisStore,
    passOnStoreError: true,
    handler,
  });

  server.use(globalLimiter);
  server.use('/profile/avatar', uploadLimiter);
  server.use('/api/auth', authLimiter);

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
