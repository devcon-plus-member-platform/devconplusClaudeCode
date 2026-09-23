import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '../auth/auth.guard';
import { ROLES_KEY } from '../common/authz/roles.decorator';
import { RolesGuard } from '../common/authz/roles.guard';
import { ChaptersController } from './chapters.controller';
import { ChaptersService } from './chapters.service';
import type { ChapterStanding } from './chapter-standing';

const CH_MANILA = 'chapter-manila';

const mockStanding: ChapterStanding = {
  chapterId: CH_MANILA,
  chapter: 'Manila',
  region: 'Luzon',
  rank: null,
  status: 'ranked',
  participationRate: 50,
  eligibleMembers: 30,
  participants: 15,
  events: 2,
  checkIns: 15,
  avgPerEvent: 7.5,
  approvedRegistrations: 20,
  showUpRate: 75,
  newMembers: 4,
  xp: 3000,
  totalPoints: 4500,
  computedAt: '2026-09-18T00:00:00.000Z',
};

const mockStandingsResponse = {
  standings: [mockStanding],
  computedAt: '2026-09-18T00:00:00.000Z',
};

function makeService() {
  return {
    getAll: jest.fn().mockResolvedValue([]),
    getStatsByChapter: jest.fn().mockResolvedValue([]),
    getStandings: jest.fn().mockResolvedValue(mockStandingsResponse),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

describe('ChaptersController', () => {
  let controller: ChaptersController;
  let service: ReturnType<typeof makeService>;

  beforeEach(async () => {
    service = makeService();
    const module = await Test.createTestingModule({
      controllers: [ChaptersController],
      providers: [{ provide: ChaptersService, useValue: service }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(ChaptersController);
  });

  it('getStatsByChapter — delegates to the service (existing endpoint, unchanged shape)', async () => {
    await controller.getStatsByChapter();
    expect(service.getStatsByChapter).toHaveBeenCalledWith();
  });

  it('getStandings — delegates to the service, same list for every officer', async () => {
    const result = await controller.getStandings();
    expect(service.getStandings).toHaveBeenCalledWith();
    expect(result).toEqual(mockStandingsResponse);
  });

  it('single-chapter standing route no longer exists — only the deleted My Chapter page called it', async () => {
    expect(
      (ChaptersController.prototype as unknown as Record<string, unknown>)
        .getChapterStanding,
    ).toBeUndefined();
  });

  // The @Roles() decorator is the only thing refusing members on the
  // standings route (the suite stubs RolesGuard to always pass, matching
  // house style). This assertion reads the decorator metadata and fails if
  // the decorator is removed or weakened.
  describe('standings authorisation metadata', () => {
    const reflector = new Reflector();
    const requiredRoles = (
      handler: (...args: never[]) => unknown,
    ): unknown =>
      reflector.getAllAndOverride<unknown>(ROLES_KEY, [
        handler,
        ChaptersController,
      ]);

    it('requires chapter_officer on getStandings', () => {
      expect(
        requiredRoles(ChaptersController.prototype.getStandings),
      ).toEqual(['chapter_officer']);
    });
  });
});
