import type { Permission } from '@fernleaf/shared';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  permissions: ReadonlySet<Permission>;
}

export function can(user: AuthUser, p: Permission): boolean {
  return user.permissions.has(p);
}
