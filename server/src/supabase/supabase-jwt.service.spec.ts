import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { SupabaseJwtService } from './supabase-jwt.service';

const TEST_SECRET = 'test-supabase-jwt-secret-32-chars!!';

async function buildService(secret = TEST_SECRET) {
  const module = await Test.createTestingModule({
    providers: [
      SupabaseJwtService,
      {
        provide: ConfigService,
        useValue: { getOrThrow: jest.fn().mockReturnValue(secret) },
      },
    ],
  }).compile();
  return module.get(SupabaseJwtService);
}

// Decode without verifying so we can inspect any JWT regardless of expiry.
function decode(token: string) {
  return jwt.decode(token) as Record<string, unknown>;
}

describe('SupabaseJwtService', () => {

  describe('claim structure', () => {
    it('sets role=authenticated and aud=authenticated (required by Supabase RLS)', async () => {
      const service = await buildService();
      const token = service.signBridgeJwt({ sub: 'profile-uuid' });
      const claims = decode(token);

      expect(claims.sub).toBe('profile-uuid');
      expect(claims.role).toBe('authenticated');
      expect(claims.aud).toBe('authenticated');
    });

    it('includes email when provided', async () => {
      const service = await buildService();
      const token = service.signBridgeJwt({ sub: 'profile-uuid', email: 'test@devcon.ph' });
      expect(decode(token).email).toBe('test@devcon.ph');
    });

    it('omits email key when not provided (no undefined claim leaked)', async () => {
      const service = await buildService();
      const token = service.signBridgeJwt({ sub: 'profile-uuid' });
      expect(decode(token)).not.toHaveProperty('email');
    });
  });

  describe('TTL', () => {
    it('defaults to a 3600s expiry matching Firebase ID token TTL', async () => {
      const service = await buildService();
      const before = Math.floor(Date.now() / 1000);
      const token = service.signBridgeJwt({ sub: 'profile-uuid' });
      const exp = decode(token).exp as number;

      // Allow ±2 s for test execution time
      expect(exp).toBeGreaterThanOrEqual(before + 3598);
      expect(exp).toBeLessThanOrEqual(before + 3602);
    });

    it('respects a custom ttlSeconds', async () => {
      const service = await buildService();
      const before = Math.floor(Date.now() / 1000);
      const token = service.signBridgeJwt({ sub: 'profile-uuid', ttlSeconds: 7200 });
      const exp = decode(token).exp as number;

      expect(exp).toBeGreaterThanOrEqual(before + 7198);
      expect(exp).toBeLessThanOrEqual(before + 7202);
    });
  });

  describe('cryptographic correctness', () => {
    it('produces a token verifiable with the configured SUPABASE_JWT_SECRET (HS256)', async () => {
      const service = await buildService();
      const token = service.signBridgeJwt({ sub: 'profile-uuid' });
      expect(() =>
        jwt.verify(token, TEST_SECRET, { algorithms: ['HS256'] }),
      ).not.toThrow();
    });

    it('fails verification with a different secret', async () => {
      const service = await buildService();
      const token = service.signBridgeJwt({ sub: 'profile-uuid' });
      expect(() =>
        jwt.verify(token, 'wrong-secret', { algorithms: ['HS256'] }),
      ).toThrow();
    });
  });
});
