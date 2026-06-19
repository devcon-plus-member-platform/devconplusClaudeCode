import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppCacheService } from '../cache/app-cache.service';
import { CacheKeys } from '../cache/cache-keys';
import { EmailService } from '../email/email.service';
import type { AdminAnalytics, PointTransaction, Profile, ProfileRole } from '../supabase/types';
import { AdminRepository } from './admin.repository';

@Injectable()
export class AdminService {
  constructor(
    private readonly repo: AdminRepository,
    private readonly cache: AppCacheService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  getUsers(): Promise<Profile[]> {
    return this.repo.findAllUsers();
  }

  getUserTransactions(userId: string): Promise<PointTransaction[]> {
    return this.repo.findUserTransactions(userId);
  }

  async updateUserRole(userId: string, role: ProfileRole): Promise<void> {
    await this.repo.updateUserRole(userId, role);
    // Cross-user invalidation: the TARGET user's AuthGuard cache holds their old
    // role — bust it so their next request reflects the new permissions, rather
    // than waiting out the TTL with stale (possibly elevated) access.
    const authUid = await this.repo.getAuthUidById(userId);
    if (authUid) await this.cache.del(CacheKeys.authProfile(authUid));
  }

  getAnalytics(): Promise<AdminAnalytics> {
    return this.repo.getAnalytics();
  }

  /**
   * Emails a chapter-officer invite. The role itself is already granted by the
   * `assign_officer_email` RPC / DB triggers — this is purely a sign-up nudge.
   * Throws ServiceUnavailableException (from EmailService) if email is unconfigured.
   */
  async inviteOfficer(
    email: string,
    chapterId: string,
    inviterName: string,
  ): Promise<{ sent: boolean }> {
    const normalised = email.toLowerCase();
    const chapterName =
      (await this.repo.findChapterName(chapterId)) ?? 'your DEVCON+ chapter';
    const appUrl = this.config.getOrThrow<string>('APP_URL');
    const signUpLink = `${appUrl}/sign-up?email=${encodeURIComponent(normalised)}`;
    await this.email.sendOfficerInviteEmail(
      normalised,
      chapterName,
      inviterName,
      signUpLink,
    );
    return { sent: true };
  }
}
