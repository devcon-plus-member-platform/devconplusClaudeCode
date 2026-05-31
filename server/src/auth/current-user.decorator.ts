import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import {
  AUTHENTICATED_USER_KEY,
  AuthenticatedUser,
} from './auth.guard';

/**
 * Extracts the authenticated user from the request, populated by AuthGuard.
 *
 * Usage:
 *   @UseGuards(AuthGuard)
 *   @Get('me')
 *   getProfile(@CurrentUser() user: AuthenticatedUser) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return (req as unknown as Record<string, unknown>)[
      AUTHENTICATED_USER_KEY
    ] as AuthenticatedUser;
  },
);
