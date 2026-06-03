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
    getAnalytics:          jest.fn().mockResolvedValue(mockAnalytics),
  } as unknown as jest.Mocked<AdminRepository>;
}

describe('AdminService', () => {
  let service: AdminService;
  let repo: jest.Mocked<AdminRepository>;

  beforeEach(() => {
    repo = makeRepo();
    service = new AdminService(repo);
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

  it('getAnalytics — returns merged analytics object from repo', async () => {
    const result = await service.getAnalytics();
    expect(result).toEqual(mockAnalytics);
    expect(repo.getAnalytics).toHaveBeenCalled();
  });
});
