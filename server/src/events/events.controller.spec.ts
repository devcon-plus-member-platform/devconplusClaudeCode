import 'reflect-metadata'; // loaded by Nest at boot; needed here for the DTO decorators
import type { Request } from 'express';
import { ListEventsQueryDto } from './dto/list-events-query.dto';
import { EventsController } from './events.controller';
import type { EventsService } from './events.service';

function setup() {
  const service = {
    listPage: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
    listAllLegacy: jest.fn().mockResolvedValue([]),
  };
  const controller = new EventsController(service as unknown as EventsService);
  return { service, controller };
}

const req = (query: Record<string, string>) => ({ query }) as unknown as Request;

describe('EventsController.list', () => {
  it('answers app versions from before pagination (no query string) with the legacy array', async () => {
    const { service, controller } = setup();
    await controller.list(new ListEventsQueryDto(), req({}));

    expect(service.listAllLegacy).toHaveBeenCalled();
    expect(service.listPage).not.toHaveBeenCalled();
  });

  it('serves a page to the current app, which always sends paging params', async () => {
    const { service, controller } = setup();
    const query = Object.assign(new ListEventsQueryDto(), { scope: 'upcoming', limit: 100, offset: 0 });
    await controller.list(query, req({ scope: 'upcoming', limit: '100', offset: '0' }));

    expect(service.listPage).toHaveBeenCalledWith(query);
    expect(service.listAllLegacy).not.toHaveBeenCalled();
  });

  it('treats any single paging param as the paginated API', async () => {
    const { service, controller } = setup();
    await controller.list(new ListEventsQueryDto(), req({ limit: '2' }));

    expect(service.listPage).toHaveBeenCalled();
    expect(service.listAllLegacy).not.toHaveBeenCalled();
  });
});
