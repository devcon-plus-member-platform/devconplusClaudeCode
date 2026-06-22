import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Global flood guard that keys by authenticated identity when possible.
 *
 * The stock ThrottlerGuard keys purely by IP. Because the app sits behind nginx with
 * `trust proxy = 1`, that IP is the *real* client IP — so a venue full of attendees behind
 * one wifi / CGNAT IP share a single bucket and trip the limit on app load. This guard runs
 * as a global APP_GUARD, BEFORE the route-level AuthGuard, so it cannot read a resolved user
 * object. Instead it derives a stable per-user key from the Firebase ID token's `sub` claim
 * (decoded, NOT verified — sufficient for bucketing; the AuthGuard still rejects invalid
 * tokens before any real work happens). Unauthenticated requests fall back to IP.
 */
@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  // Signature must match the base ThrottlerGuard (which types req as Record<string, any>).
  protected getTracker(req: Record<string, any>): Promise<string> {
    return Promise.resolve(resolveTrackerKey(req));
  }
}

/**
 * Pure keying logic (exported for unit tests): `user:<sub>` when a Bearer JWT is present,
 * otherwise `ip:<x-forwarded-for first hop or req.ip>`.
 */
export function resolveTrackerKey(req: {
  headers?: Record<string, unknown>;
  ip?: string;
}): string {
  const headers = req?.headers ?? {};
  const sub = subFromBearer(headers['authorization']);
  if (sub) return `user:${sub}`;

  const fwd = headers['x-forwarded-for'];
  const ip =
    (typeof fwd === 'string' ? fwd.split(',')[0]?.trim() : undefined) ??
    req?.ip ??
    'unknown';
  return `ip:${ip}`;
}

/** Decodes the `sub` (Firebase uid) from a Bearer JWT WITHOUT verifying the signature. */
export function subFromBearer(authHeader: unknown): string | null {
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const parts = authHeader.slice(7).split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    ) as { sub?: unknown; user_id?: unknown };
    const sub = payload.sub ?? payload.user_id;
    return typeof sub === 'string' && sub.length > 0 ? sub : null;
  } catch {
    return null;
  }
}
