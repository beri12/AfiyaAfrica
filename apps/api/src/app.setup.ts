import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { Logger } from 'nestjs-pino';
import { AppConfig } from './config/config.module';
import { requestContextMiddleware } from './common/context/request-context';

export const API_PREFIX = 'api/v1';

/** Shared app configuration for main.ts and integration tests. */
export function configureApp(app: INestApplication): void {
  const express = app as NestExpressApplication;
  const config = app.get(AppConfig);

  if (!config.isTest) app.useLogger(app.get(Logger));
  if (config.get('TRUST_PROXY')) express.set('trust proxy', 1);
  express.disable('x-powered-by');

  app.use(requestContextMiddleware);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Swagger UI needs inline styles/scripts on /api/docs only.
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(json({ limit: '256kb' }));
  app.use(urlencoded({ extended: false, limit: '64kb' }));
  app.use(cookieParser());
  app.enableCors({
    origin: [config.get('APP_ORIGIN')],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Clinic-Id', 'X-Requested-With', 'X-Request-Id'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  });
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();

  const doc = new DocumentBuilder()
    .setTitle('AfyaLink AI API')
    .setDescription(
      'REST API for the AfyaLink AI healthcare operations platform. Tenant-scoped endpoints require the `X-Clinic-Id` header. ' +
        'AI features produce drafts that require clinician review; the platform does not diagnose or prescribe.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc), {
    jsonDocumentUrl: 'api/docs/openapi.json',
  });
}
