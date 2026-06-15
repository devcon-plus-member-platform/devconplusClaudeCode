import type { AppCacheService } from '../cache/app-cache.service';
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
    getAuthUidById:        jest.fn().mockResolvedValue('fb-user-uuid'),
    getAnalytics:          jest.fn().mockResolvedValue(mockAnalytics),
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

describe('AdminService', () => {
  let service: AdminService;
  let repo: jest.Mocked<AdminRepository>;
  let cache: jest.Mocked<AppCacheService>;

  beforeEach(() => {
    repo = makeRepo();
    cache = makeCache();
    service = new AdminService(repo, cache);
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
    await service.updateUserRole('user-uuid', 'chapter_officer');
    expect(repo.updateUserRole).toHaveBeenCalledWith('user-uuid', 'chapter_officer');
  });

  it('updateUserRole — busts the TARGET user\'s auth-profile cache (cross-user)', async () => {
    repo.getAuthUidById.mockResolvedValue('fb-target-123');
    await service.updateUserRole('target-uuid', 'hq_admin');
    expect(repo.getAuthUidById).toHaveBeenCalledWith('target-uuid');
    expect(cache.del).toHaveBeenCalledWith('authprofile:fb-target-123');
  });

  it('updateUserRole — skips cache bust when target has no auth_uid', async () => {
    repo.getAuthUidById.mockResolvedValue(null);
    await service.updateUserRole('target-uuid', 'hq_admin');
    expect(cache.del).not.toHaveBeenCalled();
  });

  it('getAnalytics — returns merged analytics object from repo', async () => {
    const result = await service.getAnalytics();
    expect(result).toEqual(mockAnalytics);
    expect(repo.getAnalytics).toHaveBeenCalled();
  });
});
