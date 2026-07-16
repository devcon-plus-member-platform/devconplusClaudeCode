import type { ConfigService } from '@nestjs/config';
import type { AppCacheService } from '../cache/app-cache.service';
import type { EmailService } from '../email/email.service';
import { AdminRepository } from './admin.repository';
import { AdminService } from './admin.service';

const mockAnalytics = {
  totalMembers: 42, totalEvents: 10, xpDistributed: 5000, activeChapters: 3,
  memberGrowth: [], xpByChapter: [], attendanceTrend: [],
};

function makeRepo() {
  return {
    findAllUsers:          jest.fn().mockResolvedValue([]),
    findUserTransactions:  jest.fn().mockResolvedValue([]),
    updateUserRole:        jest.fn().mockResolvedValue(undefined),
    findRoleById:          jest.fn().mockResolvedValue('member'),
    getAuthUidById:        jest.fn().mockResolvedValue('fb-user-uuid'),
    getAnalytics:          jest.fn().mockResolvedValue(mockAnalytics),
    findChapterName:       jest.fn().mockResolvedValue('Manila'),
    findEventCreators:     jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<AdminRepository>;
}

function makeCache() {
  return {
    getOrSet: jest.fn((_k: string, _ttl: number, loader: () => unknown) => loader()),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AppCacheService>;
}

function makeEmail() {
  return {
    sendOfficerInviteEmail: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<EmailService>;
}

function makeConfig() {
  return {
    getOrThrow: jest.fn().mockReturnValue('https://app.example.test'),
  } as unknown as jest.Mocked<ConfigService>;
}

describe('AdminService', () => {
  let service: AdminService;
  let repo: jest.Mocked<AdminRepository>;
  let cache: jest.Mocked<AppCacheService>;
  let email: jest.Mocked<EmailService>;
  let config: jest.Mocked<ConfigService>;

  beforeEach(() => {
    repo = makeRepo();
    cache = makeCache();
    email = makeEmail();
    config = makeConfig();
    service = new AdminService(repo, cache, email, config);
  });

  it('getUsers — delegates to repo', async () => {
    await service.getUsers();
    expect(repo.findAllUsers).toHaveBeenCalled();
  });

  it('getUserTransactions — passes userId to repo', async () => {
    await service.getUserTransactions('user-uuid');
    expect(repo.findUserTransactions).toHaveBeenCalledWith('user-uuid');
  });

  it('updateUserRole — passes userId and role to repo', async () => {
    await service.updateUserRole('user-uuid', 'chapter_officer', 'hq_admin');
    expect(repo.updateUserRole).toHaveBeenCalledWith('user-uuid', 'chapter_officer');
  });

  it('updateUserRole — busts the TARGET user\'s auth-profile cache (cross-user)', async () => {
    repo.getAuthUidById.mockResolvedValue('fb-target-123');
    await service.updateUserRole('target-uuid', 'hq_admin', 'hq_admin');
    expect(repo.getAuthUidById).toHaveBeenCalledWith('target-uuid');
    expect(cache.del).toHaveBeenCalledWith('authprofile:fb-target-123');
  });

  it('updateUserRole — skips cache bust when target has no auth_uid', async () => {
    repo.getAuthUidById.mockResolvedValue(null);
    await service.updateUserRole('target-uuid', 'hq_admin', 'hq_admin');
    expect(cache.del).not.toHaveBeenCalled();
  });

  it('updateUserRole — hq_admin cannot grant super_admin', async () => {
    await expect(
      service.updateUserRole('target-uuid', 'super_admin', 'hq_admin'),
    ).rejects.toThrow('Only a super_admin can grant or modify super_admin status.');
    expect(repo.updateUserRole).not.toHaveBeenCalled();
  });

  it('updateUserRole — hq_admin cannot modify an existing super_admin\'s role', async () => {
    repo.findRoleById.mockResolvedValue('super_admin');
    await expect(
      service.updateUserRole('target-uuid', 'hq_admin', 'hq_admin'),
    ).rejects.toThrow('Only a super_admin can grant or modify super_admin status.');
    expect(repo.updateUserRole).not.toHaveBeenCalled();
  });

  it('updateUserRole — super_admin CAN grant super_admin', async () => {
    await service.updateUserRole('target-uuid', 'super_admin', 'super_admin');
    expect(repo.updateUserRole).toHaveBeenCalledWith('target-uuid', 'super_admin');
  });

  it('updateUserRole — super_admin CAN modify another super_admin\'s role', async () => {
    repo.findRoleById.mockResolvedValue('super_admin');
    await service.updateUserRole('target-uuid', 'hq_admin', 'super_admin');
    expect(repo.updateUserRole).toHaveBeenCalledWith('target-uuid', 'hq_admin');
  });

  it('getAnalytics — returns merged analytics object from repo', async () => {
    const result = await service.getAnalytics();
    expect(result).toEqual(mockAnalytics);
    expect(repo.getAnalytics).toHaveBeenCalled();
  });

  it('getEventCreators — delegates to repo', async () => {
    await service.getEventCreators();
    expect(repo.findEventCreators).toHaveBeenCalled();
  });

  it('inviteOfficer — emails a normalised, chapter-scoped sign-up invite', async () => {
    const result = await service.inviteOfficer('NewOfficer@Devcon.PH', 'chapter-uuid', 'Jane Admin');
    expect(repo.findChapterName).toHaveBeenCalledWith('chapter-uuid');
    expect(email.sendOfficerInviteEmail).toHaveBeenCalledWith(
      'newofficer@devcon.ph',
      'Manila',
      'Jane Admin',
      'https://app.example.test/sign-up?email=newofficer%40devcon.ph',
    );
    expect(result).toEqual({ sent: true });
  });
});
