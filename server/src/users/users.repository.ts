import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { BaseRepository } from '../common/repository/base.repository';
import { SupabaseService } from '../supabase/supabase.service';
import type { Profile } from '../supabase/types';
import type { UpdateProfileDto } from './dto/update-profile.dto';

const ALLOWED_AVATAR_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

@Injectable()
export class UsersRepository extends BaseRepository {
  constructor(supabase: SupabaseService) {
    super(supabase);
  }

  async findById(id: string): Promise<Profile> {
    const result = await this.db
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();
    return this.unwrap(result as { data: Profile | null; error: { message: string } | null });
  }

  async update(id: string, patch: UpdateProfileDto): Promise<Profile> {
    const result = await this.db
      .from('profiles')
      .update(patch as Record<string, unknown>)
      .eq('id', id)
      .select()
      .single();
    return this.unwrap(result as { data: Profile | null; error: { message: string } | null });
  }

  async uploadAvatar(
    userId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    if (!ALLOWED_AVATAR_TYPES.has(mimeType)) {
      throw new InternalServerErrorException(`Unsupported avatar MIME type: ${mimeType}`);
    }
    const ext = MIME_TO_EXT[mimeType] ?? 'jpg';
    const path = `${userId}/avatar.${ext}`;

    const { error } = await this.db.storage
      .from('avatars')
      .upload(path, buffer, { contentType: mimeType, upsert: true });

    if (error) {
      throw new InternalServerErrorException(`Avatar upload failed: ${error.message}`);
    }

    const { data } = this.db.storage.from('avatars').getPublicUrl(path);
    return data.publicUrl;
  }
}
