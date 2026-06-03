import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { Profile } from '../supabase/types';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { MAX_AVATAR_BYTES, UsersService } from './users.service';

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** GET /api/users/me — fetch the caller's own profile. */
  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<Profile> {
    return this.usersService.getProfile(user.profileId);
  }

  /** PATCH /api/users/me — update mutable profile fields. */
  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<Profile> {
    return this.usersService.updateProfile(user.profileId, dto);
  }

  /**
   * POST /api/users/me/avatar — upload a new avatar image.
   * Accepts multipart/form-data with field name "avatar".
   *
   * Multer rejects the stream before it is fully buffered if it exceeds
   * MAX_AVATAR_BYTES — this is the primary size gate. The service also
   * validates magic bytes (not the client-declared MIME type) and persists
   * the Storage URL into profiles.avatar_url server-side.
   */
  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
    }),
  )
  async uploadAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ avatar_url: string }> {
    const avatarUrl = await this.usersService.uploadAvatar(user.profileId, file);
    return { avatar_url: avatarUrl };
  }
}
