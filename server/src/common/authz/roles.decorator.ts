import { SetMetadata } from '@nestjs/common';
import type { ProfileRole } from '../../supabase/types';

export const ROLES_KEY = 'roles';

/**
 * Specifies the minimum role required for a route.
 * Roles are hierarchical: member < chapter_officer < hq_admin < super_admin.
 * Passing 'chapter_officer' grants access to officers, hq_admins, and super_admins.
 *
 * Must be used with @UseGuards(AuthGuard, RolesGuard).
 */
export const Roles = (...roles: ProfileRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
