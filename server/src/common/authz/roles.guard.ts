import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import {
  AUTHENTICATED_USER_KEY,
  type AuthenticatedUser,
} from '../../auth/auth.guard';
import type { ProfileRole } from '../../supabase/types';
import { isAtLeast } from './authz';
import { ROLES_KEY } from './roles.decorator';

/**
 * Guards routes by role. Reads the role hierarchy defined in authz.ts.
 * Must be applied after AuthGuard (which populates req[AUTHENTICATED_USER_KEY]).
 *
 * If no @Roles() metadata is present on the handler or class, the guard passes.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<ProfileRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const user = (req as unknown as Record<string, unknown>)[
      AUTHENTICATED_USER_KEY
    ] as AuthenticatedUser | undefined;

    if (!user) throw new ForbiddenException('No authenticated user on request');

    const role = user.profile.role;
    const granted = required.some((minimum) => isAtLeast(role, minimum));
    if (!granted) throw new ForbiddenException('Insufficient role for this action');
    return true;
  }
}
