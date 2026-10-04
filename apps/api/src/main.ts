// Must be first: registers the "@/..." path alias (see tsconfig.json) for
// Node's module resolution at actual runtime. tsc erases path aliases when
// compiling, and the plain "tsconfig-paths/register" entry point resolves
// baseUrl against tsconfig.json's own "./src", which is wrong once code is
// compiled into dist/ — so we register manually with baseUrl pointed at
// this file's own compiled location instead.
import { register } from 'tsconfig-paths';
register({
  baseUrl: __dirname, // dist/ at runtime, src/ under ts-jest — both correct
  paths: { '@/*': ['./*'] },
});
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { MetricsService } from './modules/metrics/metrics.service';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableShutdownHooks();
  const configService = app.get(ConfigService);
  const sentryDsn = configService.get<string>('sentry_dsn');
  const nodeEnv = configService.get<string>('node_env', 'development');

  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: configService.get<string>('sentry_environment', nodeEnv),
      tracesSampleRate: nodeEnv === 'production' ? 0.1 : 1.0,
    });
  }

  const metrics = app.get(MetricsService);
  app.use((request: Request, response: Response, next: NextFunction) => {
    const startedAt = process.hrtime.bigint();
    response.on('finish', () => {
      const routePath = request.route?.path;
      const route = routePath
        ? `${request.baseUrl}${routePath}` || '/'
        : 'unmatched';
      const durationSeconds =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;

      if (route !== '/v1/metrics') {
        metrics.recordHttpRequest(
          request.method,
          route,
          response.statusCode,
          durationSeconds,
        );
      }
    });
    next();
  });

  // Security
  app.use(helmet());

  // Exception handling
  app.useGlobalFilters(new GlobalExceptionFilter());

  // CORS
  const configuredOrigins = configService
    .getOrThrow<string>('cors_origin')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = configuredOrigins.includes('*')
    ? configService.get<string>('node_env') === 'production'
      ? []
      : [
          'http://localhost:3000',
          'http://localhost:5173',
          'http://localhost:5180',
          'http://127.0.0.1:5173',
          'http://127.0.0.1:5180',
        ]
    : configuredOrigins;
  if (allowedOrigins.length === 0) {
    throw new Error('CORS_ORIGIN must list allowed origins in production.');
  }

  const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
  app.use((request: Request, response: Response, next: NextFunction) => {
    const origin = request.get('origin');
    if (
      mutatingMethods.has(request.method) &&
      origin &&
      !allowedOrigins.includes(origin)
    ) {
      response.status(403).json({ message: 'Origin not allowed.' });
      return;
    }
    next();
  });

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Origin not allowed by CORS'));
      }
    },
    credentials: true,
  });

  // Versioning
  app.setGlobalPrefix('v1');

  const port = configService.get<number>('api_port', 3000);
  await app.listen(port);
  console.log(`✅ API running on http://localhost:${port}`);
}

bootstrap().catch((err) => {
  console.error('❌ Failed to start API:', err);
  process.exit(1);
});
