import { ForbiddenException, Injectable } from '@nestjs/common';
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

  getEventCreators(): Promise<Array<{ id: string; full_name: string }>> {
    return this.repo.findEventCreators();
  }

  async updateUserRole(userId: string, role: ProfileRole, actorRole: ProfileRole): Promise<void> {
    // Only a super_admin may grant super_admin, or change the role of an existing
    // super_admin — otherwise an hq_admin could self-escalate or demote a peer.
    if (actorRole !== 'super_admin') {
      const currentRole = await this.repo.findRoleById(userId);
      if (role === 'super_admin' || currentRole === 'super_admin') {
        throw new ForbiddenException('Only a super_admin can grant or modify super_admin status.');
      }
    }
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
   * Records a chapter-officer assignment (via the assign_officer_email RPC, service role)
   * and then best-effort sends the invite email. Replaces the former direct
   * `supabase.rpc('assign_officer_email')` browser call so the RPC can be locked down to
   * service_role. The assignment is authoritative; a mail failure only flips `invited`.
   */
  async assignOfficer(
    email: string,
    chapterId: string,
    inviterName: string,
  ): Promise<{ assigned: boolean; invited: boolean }> {
    const normalised = email.toLowerCase();
    await this.repo.assignOfficerEmail(normalised, chapterId);
    let invited = false;
    try {
      await this.inviteOfficer(normalised, chapterId, inviterName);
      invited = true;
    } catch {
      invited = false;
    }
    return { assigned: true, invited };
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
