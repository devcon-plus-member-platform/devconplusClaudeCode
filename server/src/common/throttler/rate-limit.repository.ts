import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../repository/base.repository';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class RateLimitRepository extends BaseRepository {
  constructor(supabase: SupabaseService) {
    super(supabase);
  }

  /**
   * Checks whether the identifier is within the rate limit for the given bucket.
   * Fails CLOSED on RPC error — any DB/network failure returns false (deny).
   * This matches the edge function behavior: protecting the points ecosystem is
   * more important than availability on the rate-limit check itself.
   */
  async check(identifier: string, bucket: string): Promise<boolean> {
    const { data, error } = await this.db.rpc('check_rate_limit', {
      p_identifier: identifier,
      p_bucket: bucket,
    });
    if (error) return false;
    return data as boolean;
  }
}
