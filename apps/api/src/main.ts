import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import { AppModule } from './app.module';
import { ErrorFilter } from './common/error.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  // Delivery photos arrive as data URLs; 3 MB covers a compressed phone photo.
  app.use(json({ limit: '3mb' }));
  app.useGlobalFilters(new ErrorFilter());
  const origins = (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean);
  if (origins.length) app.enableCors({ origin: origins, credentials: true });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 4000));
}
void bootstrap();
