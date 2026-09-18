import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AUTHENTICATED_USER_KEY,
  type AuthenticatedUser,
} from '../../auth/auth.guard';
import type { ProfileRole } from '../../supabase/types';
import { RolesGuard } from './roles.guard';

function userWith(role: ProfileRole): AuthenticatedUser {
  return {
    firebaseUid: `fb-${role}`,
    profileId: `profile-${role}`,
    profile: { id: `profile-${role}`, role } as AuthenticatedUser['profile'],
  };
}

function guardFor(required: ProfileRole[] | undefined): RolesGuard {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(required),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

function ctxWith(user: AuthenticatedUser | undefined): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ [AUTHENTICATED_USER_KEY]: user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('refuses a member where chapter_officer is required', () => {
    const guard = guardFor(['chapter_officer']);
    expect(() => guard.canActivate(ctxWith(userWith('member')))).toThrow(
      ForbiddenException,
    );
  });

  it('allows a chapter officer where chapter_officer is required', () => {
    const guard = guardFor(['chapter_officer']);
    expect(guard.canActivate(ctxWith(userWith('chapter_officer')))).toBe(true);
  });

  it('allows HQ admin and super admin through a chapter-officer requirement', () => {
    const guard = guardFor(['chapter_officer']);
    expect(guard.canActivate(ctxWith(userWith('hq_admin')))).toBe(true);
    expect(guard.canActivate(ctxWith(userWith('super_admin')))).toBe(true);
  });

  it('passes when no roles are required, even without a user', () => {
    const guard = guardFor(undefined);
    expect(guard.canActivate(ctxWith(undefined))).toBe(true);
  });

  it('refuses when no authenticated user is on the request', () => {
    const guard = guardFor(['chapter_officer']);
    expect(() => guard.canActivate(ctxWith(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
