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
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/exception.filter';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableShutdownHooks();
  const configService = app.get(ConfigService);

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
      : ['http://localhost:3000', 'http://localhost:5173']
    : configuredOrigins;
  if (allowedOrigins.length === 0) {
    throw new Error('CORS_ORIGIN must list allowed origins in production.');
  }

  app.enableCors({
    origin: (origin, callback) => {
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
