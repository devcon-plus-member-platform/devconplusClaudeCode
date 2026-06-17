import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RateLimit } from '../common/throttler/rate-limit.decorator';
import { RateLimitGuard } from '../common/throttler/rate-limit.guard';
import type { Profile } from '../supabase/types';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { MAX_AVATAR_BYTES, UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /api/users/check-username?username=X — check username availability.
   * Public — called during sign-up before the user has a session.
   * Returns { available: boolean }.
   */
  @Get('check-username')
  @UseGuards(RateLimitGuard)
  @RateLimit('username_check')
  async checkUsername(
    @Query('username') username: string,
  ): Promise<{ available: boolean }> {
    if (!username || username.trim().length === 0) {
      throw new BadRequestException('username query param is required');
    }
    const available = await this.usersService.isUsernameAvailable(username.trim());
    return { available };
  }

  /** GET /api/users/me — fetch the caller's own profile. */
  @Get('me')
  @UseGuards(AuthGuard)
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<Profile> {
    return this.usersService.getProfile(user.profileId);
  }

  /** PATCH /api/users/me — update mutable profile fields. */
  @Patch('me')
  @UseGuards(AuthGuard)
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<Profile> {
    return this.usersService.updateProfile(user.profileId, dto, user.firebaseUid);
  }

  /**
   * PATCH /api/users/me/complete — one-time profile completion for OAuth users.
   * Sets username + chapter_id + full_name on a profile that was created with a
   * null username during the Firebase exchange. Rejected once the profile is
   * already complete (so chapter_id can only be set here on first completion).
   */
  @Patch('me/complete')
  @UseGuards(AuthGuard)
  completeMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CompleteProfileDto,
  ): Promise<Profile> {
    return this.usersService.completeProfile(user.profileId, dto, user.firebaseUid);
  }

  /**
   * DELETE /api/users/me — delete the caller's own account.
   * Removes the profile row (FK cascades handle related data).
   * Client is responsible for signing out after a successful response.
   */
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard)
  deleteMe(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.usersService.deleteAccount(user.profileId, user.firebaseUid);
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
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
    }),
  )
  async uploadAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ avatar_url: string }> {
    const avatarUrl = await this.usersService.uploadAvatar(user.profileId, file, user.firebaseUid);
    return { avatar_url: avatarUrl };
  }
}
