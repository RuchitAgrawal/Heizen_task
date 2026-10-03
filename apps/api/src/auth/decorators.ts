import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@fernleaf/shared';
import type { AuthUser } from './auth.types';

export const PUBLIC_KEY = 'public';
export const PERMISSIONS_KEY = 'permissions';
export const ANY_SIGNED_IN_KEY = 'anySignedIn';

/** No session needed. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
/** Any signed-in staff member. */
export const SignedIn = () => SetMetadata(ANY_SIGNED_IN_KEY, true);
/** Caller needs at least one of these permissions. Routes without a decorator are denied. */
export const Requires = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
