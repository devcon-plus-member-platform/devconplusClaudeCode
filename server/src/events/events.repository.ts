import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseRepository } from '../common/repository/base.repository';
import { SupabaseService } from '../supabase/supabase.service';
import type { Event } from '../supabase/types';
import type { CreateEventDto } from './dto/create-event.dto';
import type { UpdateEventDto } from './dto/update-event.dto';

@Injectable()
export class EventsRepository extends BaseRepository {
  constructor(supabase: SupabaseService) {
    super(supabase);
  }

  async findAll(): Promise<Event[]> {
    const result = await this.db
      .from('events')
      .select('*')
      .order('event_date', { ascending: true })
      .limit(100);
    return this.unwrap(
      result as { data: Event[] | null; error: { message: string } | null },
    );
  }

  /**
   * Public participant list for the raffle wheel: names + status + checked_in
   * only. Deliberately omits email / school so it is safe to expose without auth.
   */
  async findParticipants(
    eventId: string,
  ): Promise<Array<{ name: string; checked_in: boolean; status: string }>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.db as any)
      .from('event_registrations')
      .select('status, checked_in, profiles(full_name)')
      .eq('event_id', eventId)
      .neq('status', 'cancelled');
    if (error) throw new BadRequestException((error as { message: string }).message);
    return (data ?? []).map((row: Record<string, unknown>) => {
      const p = Array.isArray(row.profiles) ? (row.profiles as unknown[])[0] : row.profiles;
      const pObj = p as { full_name?: string } | null;
      return {
        name: pObj?.full_name ?? 'Unknown',
        checked_in: Boolean(row.checked_in),
        status: (row.status ?? 'pending') as string,
      };
    });
  }

  async findById(id: string): Promise<Event | null> {
    const result = await this.db
      .from('events')
      .select('*')
      .eq('id', id)
      .single();
    return this.unwrapMaybe(
      result as { data: Event | null; error: { message: string } | null },
    );
  }

  async create(
    dto: CreateEventDto & {
      chapter_id: string;
      created_by: string;
      status?: string | null;
      is_featured?: boolean | null;
      is_promoted?: boolean | null;
    },
  ): Promise<Event> {
    const result = await this.db
      .from('events')
      .insert([dto])
      .select()
      .single();
    return this.unwrap(
      result as { data: Event | null; error: { message: string } | null },
    );
  }

  async update(id: string, dto: UpdateEventDto): Promise<Event> {
    const result = await this.db
      .from('events')
      .update(dto)
      .eq('id', id)
      .select()
      .single();
    return this.unwrap(
      result as { data: Event | null; error: { message: string } | null },
    );
  }

  async deleteWithCascade(id: string): Promise<void> {
    // Delete registrations first to avoid FK constraint violation.
    await this.db.from('event_registrations').delete().eq('event_id', id);
    const { error } = await this.db.from('events').delete().eq('id', id);
    if (error) throw new BadRequestException(error.message);
  }
}
