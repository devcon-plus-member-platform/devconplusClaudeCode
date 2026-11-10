import 'reflect-metadata'; // loaded by Nest at boot; needed here for @Type()
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { EVENTS_PAGE_DEFAULT, EVENTS_PAGE_MAX, ListEventsQueryDto } from './list-events-query.dto';

/** Mirrors the global ValidationPipe: query strings in, typed DTO out. */
function parse(query: Record<string, string>) {
  const dto = plainToInstance(ListEventsQueryDto, query);
  return { dto, errors: validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }) };
}

describe('ListEventsQueryDto', () => {
  it('defaults to scope=all, limit=20, offset=0', () => {
    const { dto, errors } = parse({});
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ scope: 'all', limit: EVENTS_PAGE_DEFAULT, offset: 0 });
  });

  it('accepts a limit up to the cap of 100', () => {
    const { dto, errors } = parse({ limit: String(EVENTS_PAGE_MAX), offset: '200', scope: 'upcoming' });
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ limit: 100, offset: 200, scope: 'upcoming' });
  });

  it.each([
    [{ limit: '101' }, 'limit'],
    [{ limit: '0' }, 'limit'],
    [{ offset: '-1' }, 'offset'],
    [{ limit: 'abc' }, 'limit'],
    [{ scope: 'soon' }, 'scope'],
  ])('rejects %j', (query, property) => {
    const { errors } = parse(query);
    expect(errors.map((e) => e.property)).toContain(property);
  });
});
