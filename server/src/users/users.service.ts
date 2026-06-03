import { BadRequestException, Injectable } from '@nestjs/common';
import type { Profile } from '../supabase/types';
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
  constructor(private readonly usersRepo: UsersRepository) {}

  getProfile(userId: string): Promise<Profile> {
    return this.usersRepo.findById(userId);
  }

  updateProfile(userId: string, dto: UpdateProfileDto): Promise<Profile> {
    return this.usersRepo.update(userId, dto as Partial<Profile>);
  }

  isUsernameAvailable(username: string): Promise<boolean> {
    return this.usersRepo.isUsernameAvailable(username);
  }

  deleteAccount(userId: string): Promise<void> {
    return this.usersRepo.deleteAccount(userId);
  }

  async uploadAvatar(
    userId: string,
    file: Express.Multer.File,
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

    return avatarUrl;
  }
}
