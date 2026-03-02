import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import express from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './lib/auth';

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

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
