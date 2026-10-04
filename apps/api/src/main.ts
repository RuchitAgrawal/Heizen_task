import 'reflect-metadata';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure';

async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule));
  const origins = (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean);
  if (origins.length) app.enableCors({ origin: origins, credentials: true });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 4000));
}
void bootstrap();
