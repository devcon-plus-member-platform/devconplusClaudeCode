import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_BUCKET_KEY = 'rateLimitBucket';

/**
 * Marks a route handler with a named rate-limit bucket from the check_rate_limit RPC.
 * The RateLimitGuard reads this metadata and verifies the call against that bucket.
 *
 * Usage: @RateLimit('qr_scan')
 * Buckets: qr_scan | qr_generate | org_upgrade | login | signup | password_reset
 */
export const RateLimit = (bucket: string): MethodDecorator =>
  SetMetadata(RATE_LIMIT_BUCKET_KEY, bucket);
