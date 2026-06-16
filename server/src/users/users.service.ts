import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { AppCacheService } from '../cache/app-cache.service';
import { CacheKeys } from '../cache/cache-keys';
import type { Profile } from '../supabase/types';
import type { CompleteProfileDto } from './dto/complete-profile.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersRepository } from './users.repository';

export const MAX_AVATAR_BYTES = 10 * 1024 * 1024; // 10 MB

// Magic-byte signatures for the four accepted image formats.
// Inspecting the buffer content prevents clients from lying about MIME type.
const MAGIC_BYTES: Array<{ mime: string; check: (b: Buffer) => boolean }> = [
  { mime: 'image/jpeg', check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png',  check: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/gif',  check: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
  // WebP: "RIFF" at 0-3, "WEBP" at 8-11
  {
    mime: 'image/webp',
    check: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
];

function detectMimeFromBuffer(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  for (const { mime, check } of MAGIC_BYTES) {
    if (check(buffer)) return mime;
  }
  return null;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly cache: AppCacheService,
  ) {}

  // GET /api/users/me reads fresh (never the cached guard profile), so the
  // profile screen always shows current points/fields. The authUid busts below
  // only refresh the AuthGuard's authz cache for this same user.

  getProfile(userId: string): Promise<Profile> {
    return this.usersRepo.findById(userId);
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
    authUid?: string | null,
  ): Promise<Profile> {
    const profile = await this.usersRepo.update(userId, dto as Partial<Profile>);
    await this.invalidateAuthProfile(authUid);
    return profile;
  }

  isUsernameAvailable(username: string): Promise<boolean> {
    return this.usersRepo.isUsernameAvailable(username);
  }

  /**
   * One-time profile completion for OAuth users (null username after exchange).
   * Allowed to set chapter_id ONLY while the profile is still incomplete — once a
   * username exists the profile is "complete" and chapter changes must go through
   * the organizer-upgrade workflow instead.
   */
  async completeProfile(
    userId: string,
    dto: CompleteProfileDto,
    authUid?: string | null,
  ): Promise<Profile> {
    const existing = await this.usersRepo.findById(userId);
    if (existing.username) {
      throw new ConflictException('Profile already completed');
    }
    const username = dto.username.toLowerCase();
    if (!(await this.usersRepo.isUsernameAvailable(username))) {
      throw new ConflictException('Username is already taken');
    }
    const profile = await this.usersRepo.update(userId, {
      full_name: dto.full_name,
      username,
      chapter_id: dto.chapter_id,
    });
    await this.invalidateAuthProfile(authUid);
    return profile;
  }

  async deleteAccount(userId: string, authUid?: string | null): Promise<void> {
    await this.usersRepo.deleteAccount(userId);
    // Drop the deleted user's cached profile immediately so a still-valid token
    // cannot ride a cached profile until the TTL expires.
    await this.invalidateAuthProfile(authUid);
  }

  async uploadAvatar(
    userId: string,
    file: Express.Multer.File,
    authUid?: string | null,
  ): Promise<string> {
    // Multer limits enforce the size cap before the buffer is materialized,
    // but we keep this check as defense-in-depth.
    if (file.size > MAX_AVATAR_BYTES) {
      throw new BadRequestException('Image must be under 10 MB');
    }

    // Inspect actual buffer content — client-declared mimetype is not trusted.
    const detectedMime = detectMimeFromBuffer(file.buffer);
    if (!detectedMime) {
      throw new BadRequestException('File does not appear to be a supported image (JPEG, PNG, WebP, or GIF)');
    }

    // Upload using the detected type so Storage sets the correct Content-Type.
    const avatarUrl = await this.usersRepo.uploadAvatar(userId, file.buffer, detectedMime);

    // Persist the URL server-side so callers cannot inject arbitrary URLs.
    await this.usersRepo.update(userId, { avatar_url: avatarUrl });
    await this.invalidateAuthProfile(authUid);

    return avatarUrl;
  }

  /** Bust the AuthGuard's cached profile for this user (no-op when authUid absent). */
  private invalidateAuthProfile(authUid?: string | null): Promise<void> {
    if (!authUid) return Promise.resolve();
    return this.cache.del(CacheKeys.authProfile(authUid));
  }
}
