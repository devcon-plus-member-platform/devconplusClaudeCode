import { Test } from '@nestjs/testing';
import { AuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { RolesGuard } from '../common/authz/roles.guard';
import { RateLimitGuard } from '../common/throttler/rate-limit.guard';
import type { Profile } from '../supabase/types';
import {
  CoOrganizersController,
  OrgCodesController,
  UpgradesController,
} from './upgrades.controller';
import { UpgradesService } from './upgrades.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const REQ_ID  = 'req-uuid-001';
const CODE_ID = 'code-uuid-001';
const TARGET_ID = 'target-uuid-001';

const officerProfile: Partial<Profile> = { id: 'officer-1', role: 'chapter_officer', chapter_id: 'ch-1' };
const adminProfile:   Partial<Profile> = { id: 'admin-1',   role: 'hq_admin',        chapter_id: 'ch-1' };
const memberProfile:  Partial<Profile> = { id: 'member-1',  role: 'member',          chapter_id: 'ch-1' };

const mockOfficer: AuthenticatedUser = { firebaseUid: 'fb-o', profileId: 'officer-1', profile: officerProfile as Profile };
const mockAdmin:   AuthenticatedUser = { firebaseUid: 'fb-a', profileId: 'admin-1',   profile: adminProfile   as Profile };
const mockMember:  AuthenticatedUser = { firebaseUid: 'fb-m', profileId: 'member-1',  profile: memberProfile  as Profile };

// ── Mock factory ──────────────────────────────────────────────────────────────

function makeService() {
  return {
    requestUpgrade:        jest.fn().mockResolvedValue({ status: 'submitted' }),
    getAllRequests:         jest.fn().mockResolvedValue([]),
    getChapterRequests:    jest.fn().mockResolvedValue([]),
    approveRequest:        jest.fn().mockResolvedValue(undefined),
    rejectRequest:         jest.fn().mockResolvedValue(undefined),
    officerApproveRequest: jest.fn().mockResolvedValue(undefined),
    getAllCodes:            jest.fn().mockResolvedValue([]),
    getChapterActiveCode:  jest.fn().mockResolvedValue(null),
    createCode:            jest.fn().mockResolvedValue({ id: CODE_ID }),
    updateCode:            jest.fn().mockResolvedValue({ id: CODE_ID }),
    deleteCode:            jest.fn().mockResolvedValue(undefined),
    getCoOrganizers:       jest.fn().mockResolvedValue([]),
    removeCoOrganizer:     jest.fn().mockResolvedValue(undefined),
  };
}

async function buildModule() {
  const service = makeService();
  const module = await Test.createTestingModule({
    controllers: [UpgradesController, OrgCodesController, CoOrganizersController],
    providers: [{ provide: UpgradesService, useValue: service }],
  })
    .overrideGuard(AuthGuard).useValue({ canActivate: () => true })
    .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
    .overrideGuard(RateLimitGuard).useValue({ canActivate: () => true })
    .compile();
  return {
    service,
    upgrades:     module.get(UpgradesController),
    orgCodes:     module.get(OrgCodesController),
    coOrganizers: module.get(CoOrganizersController),
  };
}

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('UpgradesController', () => {
  let ctx: Awaited<ReturnType<typeof buildModule>>;

  beforeEach(async () => { ctx = await buildModule(); });

  // ── Upgrade requests ──────────────────────────────────────────────────────

  it('requestUpgrade — passes user and dto to service', async () => {
    const dto = { code: 'DCN-ABC-1234' };
    const result = await ctx.upgrades.requestUpgrade(mockMember, dto);
    expect(ctx.service.requestUpgrade).toHaveBeenCalledWith(mockMember, dto);
    expect(result).toEqual({ status: 'submitted' });
  });

  it('getAllRequests — delegates to service', async () => {
    await ctx.upgrades.getAllRequests();
    expect(ctx.service.getAllRequests).toHaveBeenCalled();
  });

  it('getChapterRequests — passes full user (chapter from token)', async () => {
    await ctx.upgrades.getChapterRequests(mockOfficer);
    expect(ctx.service.getChapterRequests).toHaveBeenCalledWith(mockOfficer);
  });

  it('approveRequest — reviewer id from token, never from body', async () => {
    await ctx.upgrades.approveRequest(mockAdmin, { id: REQ_ID });
    expect(ctx.service.approveRequest).toHaveBeenCalledWith(mockAdmin, REQ_ID);
  });

  it('rejectRequest — user from token passed for chapter-scope check in service', async () => {
    await ctx.upgrades.rejectRequest(mockOfficer, { id: REQ_ID });
    expect(ctx.service.rejectRequest).toHaveBeenCalledWith(mockOfficer, REQ_ID);
  });

  it('officerApproveRequest — reviewer id from token', async () => {
    await ctx.upgrades.officerApproveRequest(mockOfficer, { id: REQ_ID });
    expect(ctx.service.officerApproveRequest).toHaveBeenCalledWith(mockOfficer, REQ_ID);
  });

  // ── Org codes ─────────────────────────────────────────────────────────────

  it('getAllCodes — delegates to service', async () => {
    await ctx.orgCodes.getAllCodes();
    expect(ctx.service.getAllCodes).toHaveBeenCalled();
  });

  it('getChapterActiveCode — passes user (chapter from token)', async () => {
    await ctx.orgCodes.getChapterActiveCode(mockOfficer);
    expect(ctx.service.getChapterActiveCode).toHaveBeenCalledWith(mockOfficer);
  });

  it('createCode — passes dto to service', async () => {
    const dto = { code: 'DCN-XYZ-5678', assigned_role: 'chapter_officer' as const };
    await ctx.orgCodes.createCode(dto);
    expect(ctx.service.createCode).toHaveBeenCalledWith(dto);
  });

  it('updateCode — passes id and dto', async () => {
    const dto = { is_active: false };
    await ctx.orgCodes.updateCode({ id: CODE_ID }, dto);
    expect(ctx.service.updateCode).toHaveBeenCalledWith(CODE_ID, dto);
  });

  it('deleteCode — passes id', async () => {
    await ctx.orgCodes.deleteCode({ id: CODE_ID });
    expect(ctx.service.deleteCode).toHaveBeenCalledWith(CODE_ID);
  });

  // ── Co-organizers ─────────────────────────────────────────────────────────

  it('getCoOrganizers — passes user (chapter/exclude-self from token)', async () => {
    await ctx.coOrganizers.getCoOrganizers(mockOfficer);
    expect(ctx.service.getCoOrganizers).toHaveBeenCalledWith(mockOfficer);
  });

  it('removeCoOrganizer — targetId from param, officer from token (IDOR defense)', async () => {
    await ctx.coOrganizers.removeCoOrganizer(mockOfficer, { id: TARGET_ID });
    expect(ctx.service.removeCoOrganizer).toHaveBeenCalledWith(mockOfficer, TARGET_ID);
  });
});
