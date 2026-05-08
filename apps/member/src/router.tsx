import { createBrowserRouter } from 'react-router-dom'
import MemberLayout from './components/MemberLayout'
import OrganizerLayout from './components/OrganizerLayout'
import AdminLayout from './components/AdminLayout'

// Auth pages (no tab nav)
import SplashScreen from './pages/auth/SplashScreen'
import Onboarding from './pages/auth/Onboarding'
import SignIn from './pages/auth/SignIn'
import SignUp from './pages/auth/SignUp'
import OrganizerCodeGate from './pages/auth/OrganizerCodeGate'
import InterestQuiz from './pages/auth/InterestQuiz'
import ForgotPassword from './pages/auth/ForgotPassword'
import EmailSent from './pages/auth/EmailSent'
import EmailConfirm from './pages/auth/EmailConfirm'
import ResetPassword from './pages/auth/ResetPassword'
import OAuthCallback from './pages/auth/OAuthCallback'
import OAuthProfileComplete from './pages/auth/OAuthProfileComplete'
import NotFound from './pages/NotFound'
import TermsAndConditions from './pages/legal/TermsAndConditions'
import PrivacyPolicy from './pages/legal/PrivacyPolicy'

// Member tab pages
import Dashboard from './pages/dashboard/Dashboard'
import EventsList from './pages/events/EventsList'
import EventDetail from './pages/events/EventDetail'
import EventRegister from './pages/events/EventRegister'
import EventPending from './pages/events/EventPending'
import EventTicket from './pages/events/EventTicket'
import EventVolunteer from './pages/events/EventVolunteer'
import JobsList from './pages/jobs/JobsList'
import JobDetail from './pages/jobs/JobDetail'
import Points from './pages/points/Points'
import PointsHistory from './pages/points/PointsHistory'
import Rewards from './pages/rewards/Rewards'
import NewsDetail from './pages/news/NewsDetail'
import Profile from './pages/profile/Profile'
import MyQR from './pages/profile/MyQR'
import ProfileEdit from './pages/profile/ProfileEdit'
import Notifications from './pages/profile/Notifications'
import Privacy from './pages/profile/Privacy'
import NotificationsInbox from './pages/notifications/NotificationsInbox'

// Organizer pages (eagerly loaded — used by chapter officers on every session)
import { OrgDashboard } from './pages/organizer/Dashboard'
import { OrgEventManagement } from './pages/organizer/events/EventManagement'
import { OrgEventCreate } from './pages/organizer/events/EventCreate'
import { OrgEventDetail } from './pages/organizer/events/EventDetail'
import { OrgEventEdit } from './pages/organizer/events/EventEdit'
import { OrgEventRegistrants } from './pages/organizer/events/EventRegistrants'
import { OrgEventSummary } from './pages/organizer/events/EventSummary'
import { OrgRewardsManagement } from './pages/organizer/rewards/RewardsManagement'
import { RewardCreate } from './pages/organizer/rewards/RewardCreate'
import { RewardEdit } from './pages/organizer/rewards/RewardEdit'
import { OrgProfile } from './pages/organizer/profile/Profile'
import { OrgProfileEdit } from './pages/organizer/profile/ProfileEdit'
import { OrgCoOrganizers } from './pages/organizer/profile/OrgCoOrganizers'

// OrgQRScanner is lazy-loaded: it pulls in @zxing (large barcode library)
// which is only needed when an officer scans tickets at the door.
// Admin pages are lazy-loaded: they're only ever accessed by super_admin or hq_admin.

export const router = createBrowserRouter([
  // Root — always start at onboarding
  { path: '/',                     element: <SplashScreen /> },

  // Public routes — no layout, no auth required
  { path: '/events/:slug',         element: <EventDetail /> },

  // Auth routes — no layout
  { path: '/onboarding',           element: <Onboarding /> },
  { path: '/sign-in',              element: <SignIn /> },
  { path: '/sign-up',              element: <SignUp /> },
  { path: '/organizer-code-gate',  element: <OrganizerCodeGate /> },
  { path: '/interests',            element: <InterestQuiz /> },
  { path: '/forgot-password',      element: <ForgotPassword /> },
  { path: '/email-sent',           element: <EmailSent /> },
  { path: '/reset-password',           element: <ResetPassword /> },
  { path: '/email-confirm',            element: <EmailConfirm /> },
  { path: '/oauth-callback',           element: <OAuthCallback /> },
  { path: '/oauth-profile-complete',   element: <OAuthProfileComplete /> },
  { path: '/terms-and-conditions',     element: <TermsAndConditions /> },
  { path: '/privacy-policy',           element: <PrivacyPolicy /> },

  // Member routes — wrapped in MemberLayout with bottom tab nav
  {
    element: <MemberLayout />,
    children: [
      { path: '/home',                       element: <Dashboard /> },
      { path: '/events',                    element: <EventsList /> },
      { path: '/events/:slug/register',       element: <EventRegister /> },
      { path: '/events/:slug/pending',        element: <EventPending /> },
      { path: '/events/:slug/ticket',         element: <EventTicket /> },
      { path: '/events/:slug/volunteer',      element: <EventVolunteer /> },
      { path: '/jobs',                      element: <JobsList /> },
      { path: '/jobs/:id',                  element: <JobDetail /> },
      { path: '/points',                    element: <Points /> },
      { path: '/points/history',            element: <PointsHistory /> },
      { path: '/news/:id',                  element: <NewsDetail /> },
      { path: '/rewards',                   element: <Rewards /> },
      { path: '/profile',                   element: <Profile /> },
      { path: '/qr',                        element: <MyQR /> },
      { path: '/profile/edit',              element: <ProfileEdit /> },
      { path: '/notifications',             element: <NotificationsInbox /> },
      { path: '/profile/notifications',     element: <Notifications /> },
      { path: '/profile/privacy',           element: <Privacy /> },
    ],
  },

  // Admin routes — all lazy-loaded, only super_admin or hq_admin users ever land here
  {
    element: <AdminLayout />,
    children: [
      {
        path: '/admin',
        lazy: () => import('./pages/admin/AdminDashboard').then((m) => ({ Component: m.default })),
      },
      {
        path: '/admin/users',
        lazy: () => import('./pages/admin/AdminUsers').then((m) => ({ Component: m.default })),
      },
      {
        path: '/admin/org-codes',
        lazy: () => import('./pages/admin/AdminOrgCodes').then((m) => ({ Component: m.default })),
      },
      {
        path: '/admin/events',
        lazy: () => import('./pages/admin/AdminEvents').then((m) => ({ Component: m.default })),
      },
      {
        path: '/admin/chapters',
        lazy: () => import('./pages/admin/AdminChapters').then((m) => ({ Component: m.default })),
      },
      {
        path: '/admin/upgrades',
        lazy: () => import('./pages/admin/AdminCMS').then((m) => ({ Component: m.default })),
      },
      {
        path: '/admin/kiosk',
        lazy: () => import('./pages/admin/AdminKiosk').then((m) => ({ Component: m.default })),
      },
    ],
  },

  // Organizer routes — wrapped in OrganizerLayout (guards on isOrganizerSession)
  {
    element: <OrganizerLayout />,
    children: [
      { path: '/organizer',                              element: <OrgDashboard /> },
      { path: '/organizer/events',                       element: <OrgEventManagement /> },
      { path: '/organizer/events/create',                element: <OrgEventCreate /> },
      { path: '/organizer/events/:id',                   element: <OrgEventDetail /> },
      { path: '/organizer/events/:id/edit',              element: <OrgEventEdit /> },
      { path: '/organizer/events/:id/registrants',       element: <OrgEventRegistrants /> },
      { path: '/organizer/events/:id/summary',           element: <OrgEventSummary /> },
      // Lazy-loaded: pulls in @zxing which is only needed for live door scanning
      {
        path: '/organizer/scan',
        lazy: async () => {
          const { OrgQRScanner } = await import('./pages/organizer/scan/QRScanner')
          return { Component: OrgQRScanner }
        },
      },
      { path: '/organizer/rewards',                      element: <OrgRewardsManagement /> },
      { path: '/organizer/rewards/create',               element: <RewardCreate /> },
      { path: '/organizer/rewards/:id/edit',             element: <RewardEdit /> },
      { path: '/organizer/profile',                      element: <OrgProfile /> },
      { path: '/organizer/profile/edit',                 element: <OrgProfileEdit /> },
      { path: '/organizer/profile/co-organizers',        element: <OrgCoOrganizers /> },
      { path: '/organizer/notifications',                 element: <NotificationsInbox isOrganizer /> },
      { path: '/organizer/profile/notifications',        element: <Notifications /> },
      { path: '/organizer/profile/privacy',              element: <Privacy /> },
    ],
  },

  // Catch-all — must be last, outside all layout groups
  { path: '*', element: <NotFound /> },
])
