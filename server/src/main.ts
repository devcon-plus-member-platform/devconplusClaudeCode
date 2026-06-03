import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // EC2 sits behind nginx which terminates TLS and sets X-Forwarded-For.
  // trust proxy = 1 makes Express read the real client IP from that header,
  // which is required for the IP-keyed rate limit buckets to work correctly.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // All new feature endpoints live under /api/*.
  // Existing auth routes (/auth/*) keep their paths — authBridge.ts and api.ts
  // call them by full path and must not break.
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'auth/(.*)', method: RequestMethod.ALL }],
  });

  // CORS — comma-separated origins from env (no trailing slash).
  const corsOrigins = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length === 0 ? false : corsOrigins,
    credentials: true,
  });

  // Global validation pipe — class-validator DTOs enforce shape.
  // whitelist + forbidNonWhitelisted = reject unknown fields (safer for auth endpoints).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
