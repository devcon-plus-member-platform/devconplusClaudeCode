import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

/**
 * Wraps the Firebase Admin SDK lifecycle and exposes the verification +
 * user-management primitives the bridge needs. Vendor-specific by nature
 * (this is the adapter layer per the vendor-neutral-naming rule).
 */
@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app!: admin.app.App;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const json = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (!json) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON env var is required');
    }

    let credentials: admin.ServiceAccount;
    try {
      credentials = JSON.parse(json) as admin.ServiceAccount;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON: ${msg}`);
    }

    // Reuse existing default app if it's already initialized (e.g. in tests / HMR)
    if (admin.apps.length === 0) {
      this.app = admin.initializeApp({
        credential: admin.credential.cert(credentials),
      });
    } else {
      this.app = admin.app();
    }

    // credentials.projectId is camelCase (ServiceAccount interface), but the raw
    // JSON from Google has project_id (snake_case). Read both to be safe.
    const projectId =
      credentials.projectId ??
      (credentials as unknown as Record<string, unknown>)['project_id'];
    this.logger.log(
      `Firebase Admin SDK initialized for project: ${projectId}`,
    );
  }

  get auth(): admin.auth.Auth {
    return this.app.auth();
  }

  /**
   * Verifies a Firebase ID token (issued by Firebase Auth client SDK after
   * Google sign-in or email/password sign-in). Returns the decoded claims.
   * Throws if the token is expired, malformed, or signed by a different project.
   */
  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    return this.auth.verifyIdToken(idToken);
  }
}
