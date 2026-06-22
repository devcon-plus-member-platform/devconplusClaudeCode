import { resolveTrackerKey, subFromBearer } from './user-aware-throttler.guard';

/** Builds an unsigned JWT (header.payload.signature) for a given payload. */
function makeJwt(payload: Record<string, unknown>): string {
  const seg = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${seg({ alg: 'none', typ: 'JWT' })}.${seg(payload)}.sig`;
}

describe('subFromBearer', () => {
  it('extracts sub from a Bearer JWT', () => {
    const token = makeJwt({ sub: 'firebase-uid-123' });
    expect(subFromBearer(`Bearer ${token}`)).toBe('firebase-uid-123');
  });

  it('falls back to user_id when sub is absent', () => {
    const token = makeJwt({ user_id: 'uid-456' });
    expect(subFromBearer(`Bearer ${token}`)).toBe('uid-456');
  });

  it('returns null for a missing or malformed header', () => {
    expect(subFromBearer(undefined)).toBeNull();
    expect(subFromBearer('Basic abc')).toBeNull();
    expect(subFromBearer('Bearer not-a-jwt')).toBeNull();
    expect(subFromBearer(`Bearer ${makeJwt({})}`)).toBeNull();
  });
});

describe('resolveTrackerKey', () => {
  it('keys by user when a Bearer token carries a sub', () => {
    const token = makeJwt({ sub: 'uid-abc' });
    expect(
      resolveTrackerKey({ headers: { authorization: `Bearer ${token}` }, ip: '1.2.3.4' }),
    ).toBe('user:uid-abc');
  });

  it('keys by the first x-forwarded-for hop when unauthenticated', () => {
    expect(
      resolveTrackerKey({ headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' } }),
    ).toBe('ip:9.9.9.9');
  });

  it('falls back to req.ip when no forwarded header is present', () => {
    expect(resolveTrackerKey({ headers: {}, ip: '5.6.7.8' })).toBe('ip:5.6.7.8');
  });

  it('two different users get distinct keys even from the same IP (venue case)', () => {
    const a = resolveTrackerKey({
      headers: { authorization: `Bearer ${makeJwt({ sub: 'a' })}`, 'x-forwarded-for': '1.1.1.1' },
    });
    const b = resolveTrackerKey({
      headers: { authorization: `Bearer ${makeJwt({ sub: 'b' })}`, 'x-forwarded-for': '1.1.1.1' },
    });
    expect(a).toBe('user:a');
    expect(b).toBe('user:b');
    expect(a).not.toBe(b);
  });
});
