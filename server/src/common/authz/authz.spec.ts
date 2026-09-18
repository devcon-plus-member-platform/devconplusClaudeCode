import { isAtLeast } from './authz';

describe('isAtLeast (role hierarchy)', () => {
  it('ranks a member below a chapter officer', () => {
    expect(isAtLeast('member', 'chapter_officer')).toBe(false);
    expect(isAtLeast('chapter_officer', 'chapter_officer')).toBe(true);
  });

  it('admits officers, HQ admins and super admins for a chapter-officer requirement', () => {
    expect(isAtLeast('chapter_officer', 'chapter_officer')).toBe(true);
    expect(isAtLeast('hq_admin', 'chapter_officer')).toBe(true);
    expect(isAtLeast('super_admin', 'chapter_officer')).toBe(true);
  });

  it('refuses lesser roles for higher requirements', () => {
    expect(isAtLeast('member', 'hq_admin')).toBe(false);
    expect(isAtLeast('chapter_officer', 'hq_admin')).toBe(false);
    expect(isAtLeast('hq_admin', 'super_admin')).toBe(false);
  });

  it('treats every role as meeting its own requirement', () => {
    for (const role of [
      'member',
      'chapter_officer',
      'hq_admin',
      'super_admin',
    ] as const) {
      expect(isAtLeast(role, role)).toBe(true);
    }
  });
});
