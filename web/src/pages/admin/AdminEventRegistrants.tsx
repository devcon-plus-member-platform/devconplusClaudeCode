// Admin registrants view — reuses the organizer Attendees page as-is.
// `useOrganizerUser()` already resolves for hq_admin/super_admin, and the
// registrations backend (RegistrationsService.assertEventChapterScope) already
// bypasses chapter checks for those roles, so admins can view/approve
// registrants for ANY event (including other chapters' and HQ events) without
// any chapter-scoping logic on this side.
export { OrgEventRegistrants as default } from '../organizer/events/EventRegistrants'
