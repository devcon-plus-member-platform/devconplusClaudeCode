import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { FirebaseService } from '../firebase/firebase.service';
import { SupabaseService } from '../supabase/supabase.service';
import { Profile } from '../supabase/types';

export interface AuthenticatedUser {
  firebaseUid: string;
  profileId: string;
  profile: Profile;
}

// Key used to attach the resolved user onto the request object.
export const AUTHENTICATED_USER_KEY = 'authenticatedUser';

/**
 * Firebase ID token guard — the foundation of the NestJS gateway era.
 *
 * Expects: Authorization: Bearer <Firebase ID token>
 *
 * On every guarded request:
 *   1. Verifies the Firebase ID token (signature, expiry, project)
 *   2. Enforces email_verified === true (prevents unverified-email attacks)
 *   3. Resolves profiles.id from auth_uid (fast — indexed column)
 *   4. Attaches AuthenticatedUser to req[AUTHENTICATED_USER_KEY]
 *
 * Controllers retrieve the user via the @CurrentUser() decorator.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly supabase: SupabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(req);

    if (!token) {
      throw new UnauthorizedException('Authorization header is required');
    }

    let decoded;
    try {
      decoded = await this.firebase.verifyIdToken(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired Firebase ID token');
    }

    if (!decoded.email_verified) {
      throw new UnauthorizedException('Email must be verified before access');
    }

    const profile = await this.supabase.findProfileByAuthUid(decoded.uid);
    if (!profile) {
      // auth_uid not linked yet — user has not completed the exchange flow
      throw new UnauthorizedException(
        'Profile not found. Complete sign-in via /auth/firebase/exchange first.',
      );
    }

    const user: AuthenticatedUser = {
      firebaseUid: decoded.uid,
      profileId: profile.id,
      profile,
    };
    (req as unknown as Record<string, unknown>)[AUTHENTICATED_USER_KEY] = user;
    return true;
  }

  private extractBearerToken(req: Request): string | null {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    return header.slice(7);
  }
}
