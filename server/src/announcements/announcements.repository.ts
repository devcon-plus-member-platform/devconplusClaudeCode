import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../common/repository/base.repository';
import { SupabaseService } from '../supabase/supabase.service';
import type { EventAnnouncement } from '../supabase/types';

@Injectable()
export class AnnouncementsRepository extends BaseRepository {
  constructor(supabase: SupabaseService) {
    super(supabase);
  }

  async findApprovedEventIdsByUser(userId: string): Promise<string[]> {
    const result = await this.db
      .from('event_registrations')
      .select('event_id')
      .eq('user_id', userId)
      .eq('status', 'approved');
    const rows = this.unwrap(
      result as { data: Array<{ event_id: string }> | null; error: { message: string } | null },
    );
    return rows.map((row) => row.event_id);
  }

  async findRecentByEventIds(eventIds: string[]): Promise<EventAnnouncement[]> {
    const result = await this.db
      .from('event_announcements')
      .select('id, event_id, organizer_id, message, created_at')
      .in('event_id', eventIds)
      .order('created_at', { ascending: false })
      .limit(50);
    return this.unwrap(
      result as { data: EventAnnouncement[] | null; error: { message: string } | null },
    );
  }

  async findEventChapterId(eventId: string): Promise<string | null> {
    const result = await this.db
      .from('events')
      .select('chapter_id')
      .eq('id', eventId)
      .maybeSingle();
    const row = this.unwrapMaybe(
      result as { data: { chapter_id: string | null } | null; error: { message: string } | null },
    );
    return row?.chapter_id ?? null;
  }

  async create(
    dto: Pick<EventAnnouncement, 'event_id' | 'organizer_id' | 'message'>,
  ): Promise<EventAnnouncement> {
    const result = await this.db
      .from('event_announcements')
      .insert(dto)
      .select('id, event_id, organizer_id, message, created_at')
      .single();
    return this.unwrap(
      result as { data: EventAnnouncement | null; error: { message: string } | null },
    );
  }
}
