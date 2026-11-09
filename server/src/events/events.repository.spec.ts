import { InternalServerErrorException } from '@nestjs/common';
import type { SupabaseService } from '../supabase/supabase.service';
import { EVENT_LIST_COLUMNS } from './event-list.fields';
import { EventsRepository } from './events.repository';

/**
 * Minimal chainable stand-in for a supabase-js query: records every builder
 * call and resolves (it is awaited) to the next queued response.
 */
function makeDb(responses: Array<Record<string, unknown>>) {
  const calls: Array<[string, unknown[]]> = [];
  const queue = [...responses];
  const builder: Record<string, unknown> = {};
  for (const method of ['from', 'select', 'or', 'eq', 'order', 'range']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => unknown) => resolve(queue.shift());
  const supabase = { raw: builder } as unknown as SupabaseService;
  return { supabase, calls };
}

const NOW = new Date('2026-11-08T10:00:00.000Z');
const AT = `"${NOW.toISOString()}"`;

describe('EventsRepository.findPage', () => {
  it('selects only list columns with an exact count, in a stable order, for the requested range', async () => {
    const { supabase, calls } = makeDb([{ data: [{ id: 'a' }], error: null, count: 41 }]);
    const repo = new EventsRepository(supabase);

    const page = await repo.findPage({ scope: 'all', limit: 20, offset: 40 }, NOW);

    expect(page).toEqual({ rows: [{ id: 'a' }], total: 41 });
    expect(calls).toContainEqual(['select', [EVENT_LIST_COLUMNS, { count: 'exact', head: false }]]);
    const orders = calls.filter(([m]) => m === 'order').map(([, args]) => args);
    expect(orders).toEqual([
      ['event_date', { ascending: false, nullsFirst: true }],
      ['id', { ascending: true }],
    ]);
    expect(calls).toContainEqual(['range', [40, 59]]);
    expect(calls.some(([m]) => m === 'or')).toBe(false);
  });

  it('scope=upcoming keeps not-yet-ended and TBA events, soonest first', async () => {
    const { supabase, calls } = makeDb([{ data: [], error: null, count: 0 }]);
    await new EventsRepository(supabase).findPage({ scope: 'upcoming', limit: 20, offset: 0 }, NOW);

    expect(calls).toContainEqual([
      'or',
      [`end_date.gte.${AT},and(end_date.is.null,event_date.gte.${AT}),and(end_date.is.null,event_date.is.null)`],
    ]);
    expect(calls.find(([m]) => m === 'order')).toEqual([
      'order',
      ['event_date', { ascending: true, nullsFirst: true }],
    ]);
  });

  it('scope=past keeps only ended events, most recent first', async () => {
    const { supabase, calls } = makeDb([{ data: [], error: null, count: 0 }]);
    await new EventsRepository(supabase).findPage({ scope: 'past', limit: 20, offset: 0 }, NOW);

    expect(calls).toContainEqual(['or', [`end_date.lt.${AT},and(end_date.is.null,event_date.lt.${AT})`]]);
    expect(calls.find(([m]) => m === 'order')).toEqual([
      'order',
      ['event_date', { ascending: false, nullsFirst: true }],
    ]);
  });

  it('returns an empty page with a fresh total when the offset is past the end (PGRST103)', async () => {
    const { supabase } = makeDb([
      { data: null, error: { message: 'Requested range not satisfiable', code: 'PGRST103' }, count: null },
      { data: null, error: null, count: 12 },
    ]);
    const page = await new EventsRepository(supabase).findPage({ scope: 'all', limit: 20, offset: 100 }, NOW);

    expect(page).toEqual({ rows: [], total: 12 });
  });

  it('throws on any other database error', async () => {
    const { supabase } = makeDb([{ data: null, error: { message: 'boom', code: 'XX000' }, count: null }]);
    await expect(
      new EventsRepository(supabase).findPage({ scope: 'all', limit: 20, offset: 0 }, NOW),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});

describe('EventsRepository.findManagePage', () => {
  it('scopes to one chapter when given a chapter id', async () => {
    const { supabase, calls } = makeDb([{ data: [], error: null, count: 0 }]);
    await new EventsRepository(supabase).findManagePage({ limit: 100, offset: 0 }, 'ch-1');

    expect(calls).toContainEqual(['select', ['*', { count: 'exact', head: false }]]);
    expect(calls).toContainEqual(['eq', ['chapter_id', 'ch-1']]);
    expect(calls).toContainEqual(['range', [0, 99]]);
  });

  it('returns every chapter for admins (null scope)', async () => {
    const { supabase, calls } = makeDb([{ data: [], error: null, count: 0 }]);
    await new EventsRepository(supabase).findManagePage({ limit: 100, offset: 0 }, null);

    expect(calls.some(([m]) => m === 'eq')).toBe(false);
  });
});
