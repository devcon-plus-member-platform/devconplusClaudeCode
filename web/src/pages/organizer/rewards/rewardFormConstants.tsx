import { z } from 'zod'

// ── Zod schema ────────────────────────────────────────────────────────────────

export const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name must be under 100 characters'),
  description: z.string().max(1000, 'Description must be under 1000 characters').optional().or(z.literal('')),
  points_cost: z.number({ coerce: true }).int().min(1, 'Must be at least 1 pt').max(100000, 'Points cost cannot exceed 100,000'),
  type: z.enum(['physical', 'digital']),
  claim_method: z.enum(['onsite', 'digital_delivery']),
  stock_remaining: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(0, 'Cannot be negative').max(100000).nullable()
  ),
  max_per_user: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(1, 'Must be at least 1').max(1000).nullable()
  ),
  is_active: z.boolean().default(true),
  is_coming_soon: z.boolean().default(true),
})

export type RewardFormData = z.infer<typeof schema>

// ── Styles (match eventFormConstants.tsx) ────────────────────────────────────

export const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md3-body-md text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20'

export const labelClass =
  'block text-md3-label-md font-bold uppercase tracking-wide text-slate-500 mb-1.5'

// ── SectionHeader (JSX — same pattern as eventFormConstants.tsx) ─────────────

export function SectionHeader({ title }: { title: string }) {
  return (
    <div className="border-t border-slate-100 pt-5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
        {title}
      </p>
    </div>
  )
}
