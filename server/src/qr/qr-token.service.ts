import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

export type QrTokenKind = 'r' | 'u' | 'p';

export interface QrTokenPayload {
  kind: QrTokenKind;
  registrationId?: string;
  userId?: string;
}

/** Mirrors the compact UUID encoding used by the Supabase edge functions. */
function uuidToCompact(uuid: string): string {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex').toString('base64url');
}

function compactToUuid(compact: string): string {
  const hex = Buffer.from(compact, 'base64url').toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

@Injectable()
export class QrTokenService {
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<string>('QR_JWT_SECRET');
  }

  /** k='r' — approved registration, 35 s TTL. No k claim for backwards compatibility with edge fn. */
  signRegistrationToken(registrationId: string): { token: string; expires_at: number } {
    const exp = Math.floor(Date.now() / 1000) + 35;
    const token = jwt.sign({ sub: uuidToCompact(registrationId), exp }, this.secret, {
      algorithm: 'HS256',
    });
    return { token, expires_at: exp };
  }

  /** k='u' — user identity QR, 300 s TTL. */
  signUserToken(userId: string): { token: string; expires_at: number } {
    const exp = Math.floor(Date.now() / 1000) + 300;
    const token = jwt.sign(
      { k: 'u', sub: uuidToCompact(userId), exp },
      this.secret,
      { algorithm: 'HS256' },
    );
    return { token, expires_at: exp };
  }

  /** k='p' — pending registration, 35 s TTL. */
  signPendingToken(registrationId: string): { token: string; expires_at: number } {
    const exp = Math.floor(Date.now() / 1000) + 35;
    const token = jwt.sign(
      { k: 'p', sub: uuidToCompact(registrationId), exp },
      this.secret,
      { algorithm: 'HS256' },
    );
    return { token, expires_at: exp };
  }

  /**
   * Verifies signature + expiry and returns the decoded payload.
   * On expired token: returns { expired: true }.
   * On invalid token: throws UnauthorizedException.
   */
  verifyToken(token: string):
    | { expired: true }
    | { expired: false; payload: QrTokenPayload } {
    let decoded: jwt.JwtPayload;
    try {
      decoded = jwt.verify(token, this.secret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        return { expired: true };
      }
      throw new UnauthorizedException('invalid_token');
    }

    const kind: QrTokenKind = (decoded.k as QrTokenKind | undefined) ?? 'r';
    const sub = decoded.sub as string;

    if (kind === 'u') {
      return { expired: false, payload: { kind, userId: compactToUuid(sub) } };
    }
    return { expired: false, payload: { kind, registrationId: compactToUuid(sub) } };
  }
}
