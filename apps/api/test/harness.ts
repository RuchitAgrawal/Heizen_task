import { Test } from '@nestjs/testing';
import { PERMISSIONS, Permission, ROLE_PRESETS } from '@fernleaf/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure';
import { PrismaService } from '../src/common/prisma.service';
import { Clock } from '../src/common/clock';
import type { AuthUser } from '../src/auth/auth.types';

export async function bootApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  return { app, prisma: app.get(PrismaService), clock: app.get(Clock), get: app.get.bind(app) };
}

export function userWith(role: keyof typeof ROLE_PRESETS | 'all', id = `test-${role}`): AuthUser {
  const permissions: readonly Permission[] = role === 'all' ? PERMISSIONS : ROLE_PRESETS[role].permissions;
  return { id, email: `${id}@test`, name: id, roleId: role, roleName: role, permissions: new Set(permissions) };
}

/** Kitchen zone is America/New_York; this turns a NY wall time into an instant. */
export function ny(isoLocal: string): Date {
  const d = new Date(`${isoLocal}-04:00`); // EDT through 1 Nov 2026
  return d;
}
