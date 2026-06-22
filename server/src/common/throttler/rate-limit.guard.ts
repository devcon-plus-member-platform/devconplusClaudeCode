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
import { RATE_LIMIT_META, type RateLimitMeta } from './rate-limit.decorator';
import { RateLimitRepository } from './rate-limit.repository';

/**
 * Identity-keyed rate limit guard backed by the check_rate_limit Supabase RPC.
 * Must be used AFTER AuthGuard (for identity keying) so req[AUTHENTICATED_USER_KEY]
 * is populated; unauthenticated routes fall back to IP or body-derived keys.
 *
 * Identifier:
 *   - keyFrom 'body.email' → `email:<lowercased email>` (falls back to IP if the body has none)
 *   - authenticated user   → `user:<profileId>`
 *   - otherwise            → `ip:<x-forwarded-for first hop or req.ip>`
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
    const meta = this.reflector.get<RateLimitMeta | undefined>(
      RATE_LIMIT_META,
      context.getHandler(),
    );
    if (!meta) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const identifier = this.buildIdentifier(req, meta);

    const allowed = await this.rateLimitRepo.check(identifier, meta.bucket);
    if (!allowed) {
      throw new HttpException(
        { message: 'Rate limit exceeded. Please try again later.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private buildIdentifier(req: Request, meta: RateLimitMeta): string {
    // Per-account keying for login: a shared venue/CGNAT IP must not exhaust one
    // bucket for everyone. Each email gets its own budget; brute-force on a single
    // account is still capped by the bucket's per-identifier limit.
    if (meta.keyFrom === 'body.email') {
      const body = req.body as { email?: unknown } | undefined;
      const email =
        typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
      // No email in body → fall back to IP so malformed requests are still limited.
      return email ? `email:${email}` : `ip:${this.clientIp(req)}`;
    }

    const user = (req as unknown as Record<string, unknown>)[
      AUTHENTICATED_USER_KEY
    ] as AuthenticatedUser | undefined;
    if (user) return `user:${user.profileId}`;
    return `ip:${this.clientIp(req)}`;
  }

  private clientIp(req: Request): string {
    const fwd = req.headers['x-forwarded-for'];
    const first = typeof fwd === 'string' ? fwd.split(',')[0]?.trim() : undefined;
    return first ?? req.ip ?? 'unknown';
  }
}
