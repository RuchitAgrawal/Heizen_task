import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import { ErrorFilter } from './common/error.filter';

/** Shared by main.ts and the HTTP tests, so tests exercise the real middleware. */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  // Delivery photos arrive as data URLs; 3 MB covers a compressed phone photo.
  app.use(json({ limit: '3mb' }));
  app.useGlobalFilters(new ErrorFilter());
  return app;
}
