import { readFileSync } from 'fs';
import { join } from 'path';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Statically-resolvable path so @vercel/nft includes maintenance.html in the function bundle.
const MAINTENANCE_HTML = readFileSync(join(__dirname, '..', 'maintenance.html'), 'utf-8');

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.status(503);
  res.setHeader('Retry-After', '172800');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(MAINTENANCE_HTML);
}
