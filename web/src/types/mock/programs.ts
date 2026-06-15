import type { Program } from '../types'

export const PROGRAMS: Program[] = [
  { id: 'prog-devcon', name: 'DEVCON+',       theme_id: 'devcon', description: 'Main DEVCON community program', is_active: true, created_at: '2024-01-01T00:00:00Z' },
  { id: 'prog-she',    name: 'She is DEVCON', theme_id: 'she',    description: 'Women in tech initiative',      is_active: true, created_at: '2024-01-01T00:00:00Z' },
  { id: 'prog-kids',   name: 'DEVCON Kids',   theme_id: 'kids',   description: 'Youth coding education',        is_active: true, created_at: '2024-01-01T00:00:00Z' },
  { id: 'prog-campus', name: 'Campus',        theme_id: 'campus', description: 'University chapter program',   is_active: true, created_at: '2024-01-01T00:00:00Z' },
]
