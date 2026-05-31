import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS — comma-separated origins from env (no trailing slash).
  // For Cloud Run prod, set CORS_ORIGIN to the Vercel URL (+ any custom domain).
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

  // Cloud Run requires binding to 0.0.0.0 (not localhost).
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
