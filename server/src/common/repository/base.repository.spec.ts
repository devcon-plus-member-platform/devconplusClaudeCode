import { InternalServerErrorException } from '@nestjs/common';
import { BaseRepository } from './base.repository';
import type { SupabaseService } from '../../supabase/supabase.service';

type Row = { id: number };
type Page = { data: Row[] | null; error: { message: string } | null; count: number | null };

/** Exposes the protected helper; the Supabase client is never touched here. */
class TestRepository extends BaseRepository {
  constructor() {
    super({} as SupabaseService);
  }
  run(build: (from: number, to: number) => Promise<Page>): Promise<Row[]> {
    return this.fetchAllPages<Row>(build);
  }
}

/**
 * Fake PostgREST: holds `total` rows but never returns more than `maxRows` per
 * request, mirroring the silent truncation the helper exists to defeat.
 */
function fakeTable(total: number, maxRows: number) {
  const calls: Array<[number, number]> = [];
  const build = (from: number, to: number): Promise<Page> => {
    calls.push([from, to]);
    const end = Math.min(to, from + maxRows - 1, total - 1);
    const data: Row[] = [];
    for (let i = from; i <= end; i++) data.push({ id: i });
    return Promise.resolve({ data, error: null, count: total });
  };
  return { build, calls };
}

describe('BaseRepository.fetchAllPages', () => {
  let repo: TestRepository;
  beforeEach(() => { repo = new TestRepository(); });

  it('returns everything in one request when the table fits under the cap', async () => {
    const { build, calls } = fakeTable(42, 1000);
    await expect(repo.run(build)).resolves.toHaveLength(42);
    expect(calls).toEqual([[0, 999]]);
  });

  it('pages past the 1000-row cap (the 1089-profile case)', async () => {
    const { build, calls } = fakeTable(1089, 1000);
    const rows = await repo.run(build);
    expect(rows).toHaveLength(1089);
    expect(rows[0]).toEqual({ id: 0 });
    expect(rows[1088]).toEqual({ id: 1088 });
    expect(calls).toEqual([[0, 999], [1000, 1999]]);
  });

  it('stays correct when the server caps rows below the requested page size', async () => {
    const { build, calls } = fakeTable(1089, 500);
    // Advancing by rows actually received, not by page size — otherwise the
    // short first batch would be mistaken for "no more rows".
    await expect(repo.run(build)).resolves.toHaveLength(1089);
    expect(calls.length).toBe(3);
  });

  it('returns an empty array for an empty table', async () => {
    const { build } = fakeTable(0, 1000);
    await expect(repo.run(build)).resolves.toEqual([]);
  });

  it('surfaces a query error instead of returning partial rows', async () => {
    const build = () => Promise.resolve({ data: null, error: { message: 'boom' }, count: null });
    await expect(repo.run(build)).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('stops instead of looping forever when count overstates the rows available', async () => {
    let calls = 0;
    const build = (): Promise<Page> => {
      calls++;
      return Promise.resolve({ data: [], error: null, count: 5_000 });
    };
    await expect(repo.run(build)).resolves.toEqual([]);
    expect(calls).toBe(1);
  });

  it('refuses to page indefinitely when the server keeps serving rows', async () => {
    // count stays ahead of what we have collected, forever.
    const build = (from: number): Promise<Page> =>
      Promise.resolve({
        data: [{ id: from }],
        error: null,
        count: Number.MAX_SAFE_INTEGER,
      });
    await expect(repo.run(build)).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
