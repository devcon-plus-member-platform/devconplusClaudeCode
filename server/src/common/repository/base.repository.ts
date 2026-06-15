import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../../supabase/supabase.service';

/**
 * Abstract base for all repository classes. Exposes the service-role Supabase
 * client and two error-mapping helpers so concrete repos never write
 * `if (error) throw` boilerplate.
 *
 * INVARIANT: Only *.repository.ts files may inject SupabaseService or import
 * @supabase/supabase-js. Controllers and services depend on repository
 * interfaces, not this class directly.
 */
export abstract class BaseRepository {
  constructor(protected readonly supabase: SupabaseService) {}

  /** Service-role Supabase client (bypasses RLS). */
  protected get db(): SupabaseClient {
    return this.supabase.raw;
  }

  /**
   * Maps a Supabase { data, error } pair to the value or a Nest exception.
   * Use with .single() calls where null data means "not found".
   */
  protected unwrap<T>({
    data,
    error,
  }: {
    data: T | null;
    error: { message: string } | null;
  }): T {
    if (error) throw new InternalServerErrorException(error.message);
    if (data === null) throw new NotFoundException('Resource not found');
    return data;
  }

  /**
   * Like unwrap but returns null instead of throwing when data is null.
   * Use with .maybeSingle() calls.
   */
  protected unwrapMaybe<T>({
    data,
    error,
  }: {
    data: T | null;
    error: { message: string } | null;
  }): T | null {
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  /**
   * Calls a Postgres RPC and maps the { success, error } envelope to a value
   * or BadRequestException. Use for business-logic RPCs (redeem_reward, etc.).
   */
  protected async rpc<T>(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) throw new BadRequestException(error.message);
    return data as T;
  }
}
