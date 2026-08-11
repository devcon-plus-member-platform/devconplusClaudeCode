interface MailtoEventInfo {
  title: string
  event_date: string | null
  location: string | null
  points_value: number
  chapterLabel: string // e.g. "Manila Chapter" or "HQ"
}

interface MailtoRegistrant {
  member_name: string
  member_email: string
  status: 'pending' | 'approved' | 'rejected'
}

export function buildRegistrantMailtoUrl(
  registrant: MailtoRegistrant,
  event: MailtoEventInfo,
  organizerEmail: string | undefined,
): string | null {
  if (registrant.status !== 'approved' && registrant.status !== 'rejected') return null

  const dateStr = event.event_date
    ? new Date(event.event_date).toLocaleString('en-PH', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
      })
    : 'Date TBA'
  const location = event.location ?? 'Location TBA'
  const organizerLabel = `DEVCON ${event.chapterLabel}`

  const subject = registrant.status === 'approved'
    ? `Invitation: 🎟️ Your spot is confirmed for ${event.title}`
    : `Update: Your registration for ${event.title}`

  const body = registrant.status === 'approved'
    ? [
        'Dear Attendee,',
        '',
        `Your spot is confirmed for ${event.title}! Join us on ${dateStr} at ${location}, hosted by ${organizerLabel}.`,
        '',
        `On event day, open your DEVCON+ app at https://devcon.plus/ and have your QR code scanned at the venue to earn your +${event.points_value} points, or ask any volunteer to help you get scanned.`,
        '',
        'Please note that space is strictly limited. If you can no longer attend, let us know as soon as possible so we can release your slot to someone on the waitlist — multiple no-shows may affect your standing for future DEVCON+ activities.',
        '',
        'We look forward to seeing you there!',
        '',
        `When: ${dateStr}`,
        `Location: ${location}`,
        `Organizer: ${organizerLabel}`,
      ].join('\n')
    : [
        'Dear Attendee,',
        '',
        `Thank you for your interest in ${event.title}. Unfortunately, we're unable to confirm your spot this time as our available slots have already been filled.`,
        '',
        'We truly appreciate your enthusiasm for DEVCON+ events. Please check https://devcon.plus/ regularly for upcoming events and other opportunities to earn points and connect with the community.',
        '',
        "If a slot opens up before the event, we'll do our best to reach out. Thank you for understanding, and we hope to see you at a future DEVCON+ event!",
        '',
        `Event: ${event.title}`,
        `When: ${dateStr}`,
        `Location: ${location}`,
        `Organizer: ${organizerLabel}`,
      ].join('\n')

  const to = organizerEmail ?? ''
  const query = [
    `bcc=${encodeURIComponent(registrant.member_email)}`,
    `subject=${encodeURIComponent(subject)}`,
    `body=${encodeURIComponent(body)}`,
  ].join('&')
  return `mailto:${encodeURIComponent(to)}?${query}`
}
