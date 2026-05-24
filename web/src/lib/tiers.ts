export interface Tier {
  name: string
  icon: string
  color: string
  min: number
}

export const TIERS: Tier[] = [
  { name: 'Novice',     icon: '○', color: '#94A3B8', min: 0     },
  { name: 'Geek',       icon: '◎', color: '#888780', min: 100   },
  { name: 'Volunteer',  icon: '◉', color: '#185FA5', min: 500   },
  { name: 'Cohort',     icon: '★', color: '#0F6E56', min: 2000  },
  { name: 'Ambassador', icon: '✦', color: '#BA7517', min: 3000  },
  { name: 'Leader',     icon: '❋', color: '#993556', min: 7000  },
  { name: 'Pioneer',    icon: '⬡', color: '#534AB7', min: 15000 },
]

export function getTier(lifetimePoints: number): Tier {
  return [...TIERS].reverse().find(t => lifetimePoints >= t.min) ?? TIERS[0]
}

export function getNextTier(lifetimePoints: number): Tier | null {
  return TIERS.find(t => t.min > lifetimePoints) ?? null
}

export function getTierProgress(lifetimePoints: number): number {
  const next = getNextTier(lifetimePoints)
  if (!next) return 100

  // Find the threshold we are moving from. 
  // If we haven't reached the first tier, we are moving from 0.
  // Otherwise, we are moving from the minimum points of the tier immediately before the next one.
  const nextIndex = TIERS.findIndex(t => t.min === next.min)
  const currentMin = nextIndex > 0 ? TIERS[nextIndex - 1].min : 0

  const progress = ((lifetimePoints - currentMin) / (next.min - currentMin)) * 100
  return Math.max(0, Math.min(100, Math.round(progress)))
}
