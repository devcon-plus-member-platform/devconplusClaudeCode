import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { WebSocketLikeConstructor } from '@supabase/realtime-js';
import * as WsModule from 'ws';
import { Profile } from './types';

/**
 * Supabase admin client (uses service role key — bypasses RLS).
 *
 * This is the data-access surface the bridge endpoints use. As more slices
 * migrate to NestJS-mediated APIs in Phase 6, additional repository methods
 * will land here. The service is *not* meant for client-impersonation —
 * always pass the caller's profile_id explicitly when scoping queries.
 */
@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private client!: SupabaseClient;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const url = this.config.getOrThrow<string>('SUPABASE_URL');
    const serviceKey = this.config.getOrThrow<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );

    // ws is a CJS module (module.exports = WebSocket) with no .default.
    // `import * as WsModule from 'ws'` compiles to `const WsModule = require('ws')`
    // in commonjs mode — so WsModule IS the constructor at runtime.
    // Default import (`import WebSocket from 'ws'`) goes through SWC's esm interop
    // which returns WsModule.default = undefined for modules without __esModule flag.
    const WsConstructor = WsModule as unknown as WebSocketLikeConstructor;

    this.client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: WsConstructor },
    });
    this.logger.log(`Supabase admin client initialized: ${url}`);
  }

  /** Raw client for repository methods we haven't wrapped yet. */
  get raw(): SupabaseClient {
    return this.client;
  }

  // ── Profile lookups for the bridge ──────────────────────────────────────

  async findProfileByAuthUid(authUid: string): Promise<Profile | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('auth_uid', authUid)
      .maybeSingle();
    if (error) {
      throw new Error(`findProfileByAuthUid failed: ${error.message}`);
    }
    return (data as Profile | null) ?? null;
  }

  async findProfileByEmail(email: string): Promise<Profile | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    if (error) {
      throw new Error(`findProfileByEmail failed: ${error.message}`);
    }
    return (data as Profile | null) ?? null;
  }

  async linkAuthUidToProfile(
    profileId: string,
    authUid: string,
    setEmailVerified = false,
  ): Promise<Profile> {
    const patch: Record<string, unknown> = { auth_uid: authUid };
    // When the caller has already verified the email (e.g. Google OAuth JIT migration),
    // backfill is_email_verified so existing rows with NULL don't hit the DB gate.
    if (setEmailVerified) patch['is_email_verified'] = true;

    const { data, error } = await this.client
      .from('profiles')
      .update(patch)
      .eq('id', profileId)
      .select()
      .single();
    if (error) {
      throw new Error(`linkAuthUidToProfile failed: ${error.message}`);
    }
    return data as Profile;
  }

  async setEmailVerified(profileId: string): Promise<void> {
    const { error } = await this.client
      .from('profiles')
      .update({ is_email_verified: true })
      .eq('id', profileId);
    if (error) {
      throw new Error(`setEmailVerified failed: ${error.message}`);
    }

    // Award the 100pt welcome bonus. The trg_award_signup_bonus trigger was gated
    // on is_email_verified=true at INSERT, so it skipped for email/password users
    // (created with is_email_verified=false at signup). The RPC is idempotent —
    // it checks point_transactions to avoid double-awarding.
    const { error: bonusError } = await this.client.rpc(
      'award_signup_bonus_for_verified',
      { p_profile_id: profileId },
    );
    if (bonusError) {
      // Non-fatal — points can be manually awarded; don't block email verification.
      console.warn(`award_signup_bonus_for_verified failed for ${profileId}: ${bonusError.message}`);
    }
  }

  /**
   * Applies a pre-assigned officer role to a verified profile, if one exists.
   *
   * The officer auto-assignment used to live in Supabase auth.users triggers, which
   * the Firebase signup/verification flow never fires. This RPC re-homes that step
   * so NestJS can run it on every verification path. The RPC is idempotent and
   * verification-gated (no-ops unless profiles.is_email_verified is true AND an
   * active, unconsumed officer_email_assignments row matches the profile's email),
   * so callers can invoke it freely without pre-checking.
   */
  async applyOfficerEmailAssignment(profileId: string): Promise<void> {
    const { error } = await this.client.rpc('apply_officer_email_assignment', {
      p_profile_id: profileId,
    });
    if (error) {
      throw new Error(`applyOfficerEmailAssignment failed: ${error.message}`);
    }
  }

  async createProfileWithBonus(input: {
    id: string;
    email: string;
    full_name: string;
    chapter_id?: string | null;
    username?: string | null;
    school_or_company?: string | null;
    auth_uid: string;
    is_email_verified?: boolean;
  }): Promise<Profile> {
    // Calls the RPC defined in supabase/migrations/20260528_firebase_auth_foundation.sql.
    // The trg_award_signup_bonus AFTER INSERT trigger on profiles awards the
    // 100pt welcome bonus automatically — NestJS does not duplicate point logic.
    const { data, error } = await this.client.rpc('create_profile_with_bonus', {
      p_id: input.id,
      p_email: input.email,
      p_full_name: input.full_name,
      p_chapter_id: input.chapter_id ?? null,
      p_username: input.username ?? null,
      p_school_or_company: input.school_or_company ?? null,
      p_auth_uid: input.auth_uid,
      p_is_email_verified: input.is_email_verified ?? false,
    });
    if (error) {
      throw new Error(`createProfileWithBonus failed: ${error.message}`);
    }
    return data as Profile;
  }
}
