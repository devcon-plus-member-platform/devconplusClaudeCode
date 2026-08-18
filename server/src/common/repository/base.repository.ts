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

  /** Rows requested per page when exhausting a table (matches Supabase's default max-rows). */
  private static readonly PAGE_SIZE = 1000;
  /** Hard stop so a miscounting server can never spin this loop forever. */
  private static readonly MAX_PAGES = 200;

  /**
   * Pages through an entire result set.
   *
   * PostgREST caps every response at `max-rows` (1000 on Supabase by default) and
   * reports NO error when it truncates, so a plain `.select()` on a table that has
   * grown past the cap silently returns a partial list — which is how the admin
   * Users tab came to show 1000 members while the dashboard counted 1089.
   *
   * `build` receives a zero-based inclusive row window and must return a query
   * that applies it via `.range(from, to)` and asks for an exact count. The loop
   * advances by the number of rows actually returned, so it stays correct even if
   * the server's max-rows is smaller than PAGE_SIZE.
   */
  protected async fetchAllPages<T>(
    build: (
      from: number,
      to: number,
    ) => PromiseLike<{
      data: T[] | null;
      error: { message: string } | null;
      count: number | null;
    }>,
  ): Promise<T[]> {
    const pageSize = BaseRepository.PAGE_SIZE;
    const rows: T[] = [];
    let total = Number.POSITIVE_INFINITY;

    for (let page = 0; rows.length < total; page++) {
      if (page >= BaseRepository.MAX_PAGES) {
        throw new InternalServerErrorException(
          `Refusing to page beyond ${BaseRepository.MAX_PAGES * pageSize} rows`,
        );
      }
      const { data, error, count } = await build(rows.length, rows.length + pageSize - 1);
      if (error) throw new InternalServerErrorException(error.message);
      if (count !== null) total = count;
      const batch = data ?? [];
      // No rows came back: either we are done or the window is past the end.
      // Either way there is no progress to make, so stop instead of looping.
      if (batch.length === 0) break;
      rows.push(...batch);
    }

    return rows;
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
