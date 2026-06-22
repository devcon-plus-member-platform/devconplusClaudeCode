import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_META = 'rateLimitMeta';

export interface RateLimitOptions {
  /**
   * Where to derive the rate-limit identifier from.
   * - omitted (default): identity keying — `user:<profileId>` if authenticated, else `ip:<client ip>`.
   * - 'body.email': key by the lowercased email in the request body (falls back to IP if absent).
   *   Used for the `login` bucket so a shared venue / CGNAT IP does not exhaust one bucket for the
   *   whole crowd — each account gets its own per-email budget while brute-force on any single
   *   account stays capped.
   */
  keyFrom?: 'body.email';
}

export interface RateLimitMeta extends RateLimitOptions {
  bucket: string;
}

/**
 * Marks a route handler with a named rate-limit bucket from the check_rate_limit RPC.
 * The RateLimitGuard reads this metadata and verifies the call against that bucket.
 *
 * Usage:
 *   @RateLimit('qr_scan')                            // identity-keyed (user id, else IP)
 *   @RateLimit('login', { keyFrom: 'body.email' })   // per-account keying
 * Buckets: qr_scan | qr_generate | org_upgrade | login | signup | password_reset | send_email | username_check
 */
export const RateLimit = (
  bucket: string,
  options: RateLimitOptions = {},
): MethodDecorator =>
  SetMetadata(RATE_LIMIT_META, { bucket, ...options } satisfies RateLimitMeta);
