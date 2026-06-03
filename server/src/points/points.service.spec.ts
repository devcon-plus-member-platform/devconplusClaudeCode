import type { AuthenticatedUser } from '../auth/auth.guard';
import type { Profile } from '../supabase/types';
import { PointsRepository } from './points.repository';
import { PointsService } from './points.service';

function makeUser(id = 'uid-1'): AuthenticatedUser {
  return { firebaseUid: 'fb', profileId: id, profile: { id, role: 'member', chapter_id: 'ch-1' } as Profile };
}

const member = makeUser('member-1');

function makeRepo() {
  return {
    findTransactions:  jest.fn().mockResolvedValue([]),
    findPointSummary:  jest.fn().mockResolvedValue({ spendable_points: 500, lifetime_points: 1200 }),
    findAllTiers:      jest.fn().mockResolvedValue([]),
    createTier:        jest.fn().mockResolvedValue({ id: 'tier-1', name: 'Geek' }),
    updateTier:        jest.fn().mockResolvedValue({ id: 'tier-1', name: 'Geek Updated' }),
    deleteTier:        jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<PointsRepository>;
}

describe('PointsService', () => {
  let service: PointsService;
  let repo: jest.Mocked<PointsRepository>;

  beforeEach(() => {
    repo = makeRepo();
    service = new PointsService(repo);
  });

  it('getTransactions — scoped to caller profileId (IDOR defense)', async () => {
    await service.getTransactions(member);
    expect(repo.findTransactions).toHaveBeenCalledWith('member-1');
  });

  it('getPointSummary — scoped to caller profileId', async () => {
    const result = await service.getPointSummary(member);
    expect(repo.findPointSummary).toHaveBeenCalledWith('member-1');
    expect(result).toEqual({ spendable_points: 500, lifetime_points: 1200 });
  });

  it('getAllTiers — delegates to repo', async () => {
    await service.getAllTiers();
    expect(repo.findAllTiers).toHaveBeenCalled();
  });

  it('createTier — passes dto to repo', async () => {
    const dto = { name: 'Geek', label: 'Geek', min_points: 100 };
    await service.createTier(dto);
    expect(repo.createTier).toHaveBeenCalledWith(dto);
  });

  it('updateTier — passes id and dto to repo', async () => {
    const dto = { name: 'Geek Updated' };
    await service.updateTier('tier-1', dto);
    expect(repo.updateTier).toHaveBeenCalledWith('tier-1', dto);
  });

  it('deleteTier — passes id to repo', async () => {
    await service.deleteTier('tier-1');
    expect(repo.deleteTier).toHaveBeenCalledWith('tier-1');
  });
});
