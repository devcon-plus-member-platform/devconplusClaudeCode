import { useEffect, useState } from 'react'
import type { Event } from '@devcon-plus/supabase'
import { useEventsStore } from '../stores/useEventsStore'

interface EventBySlugResult {
  /** The full event (all columns), once loaded. */
  event: Event | undefined
  /** True only while there is nothing to show yet. */
  isLoading: boolean
  /** True when the event doesn't exist or couldn't be loaded. */
  notFound: boolean
}

/**
 * Loads one full event for the event pages (detail, register, ticket, pending,
 * volunteer) from GET /api/events/slug/:slug.
 *
 * The events list only carries list columns and only upcoming events, so pages
 * must not look their event up in it. A previously loaded copy is shown at once
 * and refreshed in the background on every visit.
 */
export function useEventBySlug(slug: string | undefined): EventBySlugResult {
  const event = useEventsStore((s) => (slug ? s.eventsBySlug[slug] : undefined))
  const fetchEventBySlug = useEventsStore((s) => s.fetchEventBySlug)
  const [status, setStatus] = useState<'loading' | 'done' | 'failed'>(slug ? 'loading' : 'failed')

  useEffect(() => {
    if (!slug) {
      setStatus('failed')
      return
    }
    let active = true
    setStatus('loading')
    void fetchEventBySlug(slug).then((loaded) => {
      if (active) setStatus(loaded ? 'done' : 'failed')
    })
    return () => {
      active = false
    }
  }, [slug, fetchEventBySlug])

  return {
    event,
    isLoading: !event && status === 'loading',
    notFound: !event && status === 'failed',
  }
}
