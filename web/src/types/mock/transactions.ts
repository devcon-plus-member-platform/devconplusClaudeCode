import type { PointTransaction } from '../types'

// Matching the XP history shown in the prototype (v-xp screen).
// Groups: Today (Feb 24), This Week (Feb 19-20), Earlier (Jan-Feb 15)
export const TRANSACTIONS: PointTransaction[] = [
  {
    id: 'txn-1',
    user_id: 'user-marie-santos',
    amount: 10,
    description: 'Shared DEVCON post — LinkedIn',
    transaction_ref: 'TXN-20260224-001',
    source: 'content_share',
    created_at: '2026-02-24T09:15:00Z',
  },
  {
    id: 'txn-2',
    user_id: 'user-marie-santos',
    amount: 5,
    description: 'Liked community post',
    transaction_ref: 'TXN-20260224-002',
    source: 'content_like',
    created_at: '2026-02-24T08:40:00Z',
  },
  {
    id: 'txn-3',
    user_id: 'user-marie-santos',
    amount: 700,
    description: 'Speaker — AI Academy Session',
    transaction_ref: 'TXN-20260220-008',
    source: 'speaking',
    created_at: '2026-02-20T14:00:00Z',
  },
  {
    id: 'txn-4',
    user_id: 'user-marie-santos',
    amount: -500,
    description: 'Redeemed Coffee Voucher',
    transaction_ref: 'TXN-20260219-007',
    source: 'redemption',
    created_at: '2026-02-19T11:00:00Z',
  },
  {
    id: 'txn-5',
    user_id: 'user-marie-santos',
    amount: 300,
    description: 'Attended DEVCON Summit Manila',
    transaction_ref: 'TXN-20260215-005',
    source: 'event_attendance',
    created_at: '2026-02-15T18:00:00Z',
  },
  {
    id: 'txn-6',
    user_id: 'user-marie-santos',
    amount: 250,
    description: 'Brown Bag Session — Cebu',
    transaction_ref: 'TXN-20260210-003',
    source: 'brown_bag',
    created_at: '2026-02-10T13:00:00Z',
  },
  {
    id: 'txn-7',
    user_id: 'user-marie-santos',
    amount: 500,
    description: 'Signup Points Bonus',
    transaction_ref: 'TXN-20260101-001',
    source: 'signup',
    created_at: '2026-01-01T00:00:00Z',
  },
]
