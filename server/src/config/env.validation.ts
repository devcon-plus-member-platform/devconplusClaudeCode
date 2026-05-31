import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  validateSync,
} from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvVariables {
  @IsEnum(NodeEnv)
  NODE_ENV!: NodeEnv;

  @IsOptional()
  @IsString()
  PORT?: string;

  // ── Supabase ────────────────────────────────────────────────────────────
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  SUPABASE_URL!: string;

  @IsNotEmpty()
  @IsString()
  SUPABASE_SERVICE_ROLE_KEY!: string;

  @IsNotEmpty()
  @IsString()
  SUPABASE_JWT_SECRET!: string;

  // ── Firebase Admin SDK ──────────────────────────────────────────────────
  // Single-line JSON of the service account credential. See server/.env.example
  // for how to produce this from the downloaded credential file.
  @IsNotEmpty()
  @IsString()
  FIREBASE_SERVICE_ACCOUNT_JSON!: string;

  // Firebase Web API key — used server-side only for the REST sign-in endpoint
  // (/auth/email/signin calls identitytoolkit.googleapis.com to verify passwords).
  // Get from Firebase Console → Project Settings → General → Web API key.
  @IsNotEmpty()
  @IsString()
  FIREBASE_WEB_API_KEY!: string;

  // ── Email (Gmail SMTP) ───────────────────────────────────────────────────
  // Gmail address used as sender. In production use a Workspace account.
  @IsNotEmpty()
  @IsString()
  GMAIL_USER!: string;

  // Gmail App Password (16 chars). Create at Google Account → Security → App Passwords.
  // This is NOT the account password.
  @IsNotEmpty()
  @IsString()
  GMAIL_APP_PASSWORD!: string;

  // Secret for signing email verification JWTs (stateless, 24h TTL).
  @IsNotEmpty()
  @IsString()
  EMAIL_VERIFICATION_SECRET!: string;

  // Public frontend base URL — used to build post-verification redirect URLs.
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  APP_URL!: string;

  // Public server base URL — used to build verification links in emails that
  // must hit the backend first (e.g. /auth/email/verify) before redirecting.
  // Local: http://localhost:3000  Production: https://your-cloud-run-url
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  SERVER_URL!: string;

  // ── CORS ────────────────────────────────────────────────────────────────
  // Comma-separated list of allowed origins (no trailing slash).
  @IsNotEmpty()
  @IsString()
  CORS_ORIGIN!: string;
}

export function validateEnv(config: Record<string, unknown>): EnvVariables {
  const validated = plainToInstance(EnvVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const messages = errors
      .map(
        (e) =>
          `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
      )
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${messages}`);
  }
  return validated;
}
