import { BadRequestException, Injectable } from '@nestjs/common';
import type { Profile } from '../supabase/types';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersRepository } from './users.repository';

const ALLOWED_AVATAR_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const MAX_AVATAR_BYTES = 10 * 1024 * 1024; // 10 MB

@Injectable()
export class UsersService {
  constructor(private readonly usersRepo: UsersRepository) {}

  getProfile(userId: string): Promise<Profile> {
    return this.usersRepo.findById(userId);
  }

  updateProfile(userId: string, dto: UpdateProfileDto): Promise<Profile> {
    return this.usersRepo.update(userId, dto);
  }

  async uploadAvatar(
    userId: string,
    file: Express.Multer.File,
  ): Promise<string> {
    if (!ALLOWED_AVATAR_MIME.has(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, WebP, and GIF images are allowed');
    }
    if (file.size > MAX_AVATAR_BYTES) {
      throw new BadRequestException('Image must be under 10 MB');
    }
    return this.usersRepo.uploadAvatar(userId, file.buffer, file.mimetype);
  }
}
