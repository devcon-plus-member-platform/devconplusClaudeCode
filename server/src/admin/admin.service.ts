import { Injectable } from '@nestjs/common';
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

  sendOfficerInvitation(email: string, chapterName: string): Promise<void> {
    return this.email.sendOfficerInvitationEmail(email, chapterName);
  }
}
