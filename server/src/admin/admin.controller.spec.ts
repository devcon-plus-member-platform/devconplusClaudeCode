import { Test } from '@nestjs/testing';
import { AuthenticatedUser, AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../common/authz/roles.guard';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

const USER_ID = 'user-uuid-001';

const mockCaller = {
  firebaseUid: 'firebase-uid-caller',
  profileId: 'caller-uuid-001',
  profile: { role: 'hq_admin' },
} as AuthenticatedUser;

const mockAnalytics = {
  totalMembers: 42, totalEvents: 10, xpDistributed: 5000, activeChapters: 3,
  memberGrowth: [], xpByChapter: [], attendanceTrend: [],
};

function makeService() {
  return {
    getUsers:             jest.fn().mockResolvedValue([]),
    getUserTransactions:  jest.fn().mockResolvedValue([]),
    updateUserRole:       jest.fn().mockResolvedValue(undefined),
    getAnalytics:         jest.fn().mockResolvedValue(mockAnalytics),
  };
}

describe('AdminController', () => {
  let controller: AdminController;
  let service: ReturnType<typeof makeService>;

  beforeEach(async () => {
    service = makeService();
    const module = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: service }],
    })
      .overrideGuard(AuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();
    controller = module.get(AdminController);
  });

  it('getUsers — delegates to service', async () => {
    await controller.getUsers();
    expect(service.getUsers).toHaveBeenCalled();
  });

  it('getUserTransactions — passes id param to service', async () => {
    await controller.getUserTransactions({ id: USER_ID });
    expect(service.getUserTransactions).toHaveBeenCalledWith(USER_ID);
  });

  it('updateUserRole — passes id param, role from body, and caller role (IDOR: userId from param only)', async () => {
    await controller.updateUserRole({ id: USER_ID }, { role: 'chapter_officer' }, mockCaller);
    expect(service.updateUserRole).toHaveBeenCalledWith(USER_ID, 'chapter_officer', 'hq_admin');
  });

  it('getAnalytics — returns merged analytics response', async () => {
    const result = await controller.getAnalytics();
    expect(service.getAnalytics).toHaveBeenCalled();
    expect(result).toEqual(mockAnalytics);
  });
});
