import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { isPermission, Permission } from '@fernleaf/shared';
import { PrismaService } from '../common/prisma.service';
import { AppError, forbidden } from '../common/errors';
import { ANY_SIGNED_IN_KEY, PERMISSIONS_KEY, PUBLIC_KEY } from './decorators';
import type { AuthUser } from './auth.types';
import { SESSION_COOKIE } from './auth.constants';

/**
 * Global guard. Order of checks:
 * 1. @Public routes pass.
 * 2. A valid session cookie is required; the user and role are reloaded every request,
 *    so deactivating a user or editing a role takes effect immediately.
 * 3. @Requires(...) needs one of the listed permissions. @SignedIn needs nothing more.
 *    Anything else is denied: forgetting a decorator fails closed.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const token: string | undefined = req.cookies?.[SESSION_COOKIE];
    const unauthenticated = new AppError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Please sign in');
    if (!token) throw unauthenticated;

    let sub: string;
    try {
      sub = (await this.jwt.verifyAsync<{ sub: string }>(token)).sub;
    } catch {
      throw unauthenticated;
    }
    const staff = await this.prisma.staffUser.findUnique({ where: { id: sub }, include: { role: true } });
    if (!staff || !staff.active) throw unauthenticated;

    const user: AuthUser = {
      id: staff.id,
      email: staff.email,
      name: staff.name,
      roleId: staff.roleId,
      roleName: staff.role.name,
      permissions: new Set(staff.role.permissions.filter(isPermission)),
    };
    req.user = user;

    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, targets);
    if (required) {
      if (required.some((p) => user.permissions.has(p))) return true;
      throw forbidden();
    }
    if (this.reflector.getAllAndOverride<boolean>(ANY_SIGNED_IN_KEY, targets)) return true;
    throw forbidden('This endpoint has no access rule');
  }
}
