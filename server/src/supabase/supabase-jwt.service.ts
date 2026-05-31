import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

export interface SupabaseBridgeClaims {
  sub: string;
  email?: string;
  role: 'authenticated';
  aud: 'authenticated';
}

/**
 * Signs Supabase-compatible JWTs for the JWT-bridge era (Phases 1–6).
 *
 * Supabase PostgREST/Realtime/Storage verify tokens with HS256 + the project's
 * JWT secret. They don't enforce a particular issuer — any JWT signed with the
 * right secret and carrying the standard claims (sub, role, aud, exp) is
 * accepted. We sign with sub = profiles.id so auth.uid() returns the right
 * UUID and existing RLS policies keep working unchanged.
 *
 * This service has a sunset date: when the last direct supabase-js call from
 * the frontend is migrated to a NestJS endpoint (Phase 7), this service is
 * deleted along with SUPABASE_JWT_SECRET.
 */
@Injectable()
export class SupabaseJwtService {
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<string>('SUPABASE_JWT_SECRET');
  }

  signBridgeJwt(input: {
    sub: string;
    email?: string;
    ttlSeconds?: number;
  }): string {
    const ttl = input.ttlSeconds ?? 3600; // matches Firebase ID token TTL
    const payload: SupabaseBridgeClaims = {
      sub: input.sub,
      role: 'authenticated',
      aud: 'authenticated',
    };
    if (input.email) {
      payload.email = input.email;
    }
    return jwt.sign(payload, this.secret, {
      algorithm: 'HS256',
      expiresIn: ttl,
    });
  }
}
