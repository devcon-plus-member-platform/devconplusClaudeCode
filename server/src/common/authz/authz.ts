import type { ProfileRole } from '../../supabase/types';

const ROLE_RANK: Record<ProfileRole, number> = {
  member: 0,
  chapter_officer: 1,
  hq_admin: 2,
  super_admin: 3,
};

/** Returns true if `role` meets or exceeds the `minimum` role requirement. */
export function isAtLeast(role: ProfileRole, minimum: ProfileRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}
