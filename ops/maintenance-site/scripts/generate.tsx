import { writeFileSync } from 'fs';
import { join } from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MaintenanceShell } from '../shell/MaintenanceShell';

// Single source of truth for the maintenance page's return date. Update this line only,
// then run `npm run generate` — it regenerates both static HTML copies below so they
// can never drift from each other.
const BACK_BY = 'Monday, August 3, 2026';

const html = `<!DOCTYPE html>\n${renderToStaticMarkup(<MaintenanceShell backBy={BACK_BY} />)}\n`;

const targets = [
  join(__dirname, '..', 'maintenance.html'),
  join(__dirname, '..', '..', '..', 'web', 'public', 'maintenance.html'),
];

for (const target of targets) {
  writeFileSync(target, html, 'utf-8');
  console.log(`wrote ${target}`);
}
