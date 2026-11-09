import { buildEventSlug } from './event-slug';

const ID = '1a2b3c4d-0000-4000-8000-000000000000';

describe('buildEventSlug', () => {
  it('kebab-cases the title and appends the first 8 characters of the id', () => {
    expect(buildEventSlug('DEVCON Summit 2027!', ID)).toBe('devcon-summit-2027-1a2b3c4d');
  });

  it('collapses runs of symbols and trims leading/trailing dashes', () => {
    expect(buildEventSlug('  --Kids  Hour of AI (Cebu) --  ', ID)).toBe('kids-hour-of-ai-cebu-1a2b3c4d');
  });

  it("falls back to 'event' when the title has no letters or digits", () => {
    expect(buildEventSlug('🎉🎉', ID)).toBe('event-1a2b3c4d');
  });

  it('gives identically-titled events different slugs', () => {
    const other = '9f8e7d6c-0000-4000-8000-000000000000';
    expect(buildEventSlug('Tech Talk', ID)).not.toBe(buildEventSlug('Tech Talk', other));
  });
});
