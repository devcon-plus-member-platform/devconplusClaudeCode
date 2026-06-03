import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import {
  AUTHENTICATED_USER_KEY,
  type AuthenticatedUser,
} from '../../auth/auth.guard';
import { RATE_LIMIT_BUCKET_KEY } from './rate-limit.decorator';
import { RateLimitRepository } from './rate-limit.repository';

/**
 * Identity-keyed rate limit guard backed by the check_rate_limit Supabase RPC.
 * Must be used AFTER AuthGuard so req[AUTHENTICATED_USER_KEY] is populated.
 *
 * Builds identifier as:
 *   - `user:<profileId>`   when an authenticated user is present
 *   - `ip:<x-forwarded-for or req.ip>` for unauthenticated routes
 *
 * Fails closed (429) on any RPC error — consistent with edge function behavior.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitRepo: RateLimitRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const bucket = this.reflector.get<string | undefined>(
      RATE_LIMIT_BUCKET_KEY,
      context.getHandler(),
    );
    if (!bucket) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const user = (req as unknown as Record<string, unknown>)[
      AUTHENTICATED_USER_KEY
    ] as AuthenticatedUser | undefined;

    const identifier = user
      ? `user:${user.profileId}`
      : `ip:${(req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.ip ?? 'unknown'}`;

    const allowed = await this.rateLimitRepo.check(identifier, bucket);
    if (!allowed) {
      throw new HttpException(
        { message: 'Rate limit exceeded. Please try again later.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
