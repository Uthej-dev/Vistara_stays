import { createBrowserRouter } from 'react-router'
import PublicLayout from '../layouts/PublicLayout'
import HomePage from '../pages/HomePage'
import SearchPage from '../pages/SearchPage'
import CreditsPage from '../pages/CreditsPage'
import DestinationsPage from '../pages/DestinationsPage'
import DestinationPage from '../pages/DestinationPage'
import ComingSoonPage from '../pages/ComingSoonPage'
import NotFoundPage from '../pages/NotFoundPage'
import LoginPage from '../pages/auth/LoginPage'
import SignupPage from '../pages/auth/SignupPage'
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from '../pages/auth/PasswordPages'
import AccountPage from '../pages/AccountPage'
import FavouritesPage from '../pages/FavouritesPage'
import RequireAuth from '../features/auth/RequireAuth'
import ResortPage from '../pages/ResortPage'
import OwnersLandingPage from '../pages/OwnersLandingPage'
import { lazy, Suspense } from 'react'
import { FullPageSpinner } from '../features/auth/RequireAuth'



// Portals and checkout are split into separate chunks: visitors browsing stays never download them.
const named = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })))
const ownerPages = () => import('../pages/owner/OwnerBookingsPages')
const adminPages = () => import('../pages/admin/AdminPages')
const adminContent = () => import('../pages/admin/AdminContentPages')
const tripPages = () => import('../pages/booking/TripsPages')
const L = {
  OwnerShell: lazy(() => import('../features/owner/OwnerShell')),
  OwnerDashboardPage: lazy(() => import('../pages/owner/OwnerDashboardPage')),
  OwnerResortsPage: lazy(() => import('../pages/owner/OwnerResortsPage')),
  ResortEditorPage: lazy(() => import('../pages/owner/ResortEditorPage')),
  OwnerCalendarPage: lazy(() => import('../pages/owner/OwnerCalendarPage')),
  OwnerReviewsPage: lazy(() => import('../pages/owner/OwnerReviewsPage')),
  OwnerBookingsPage: named(ownerPages, 'OwnerBookingsPage'),
  OwnerBookingPage: named(ownerPages, 'OwnerBookingPage'),
  OwnerEnquiriesPage: named(ownerPages, 'OwnerEnquiriesPage'),
  AdminShell: lazy(() => import('../features/admin/AdminShell')),
  AdminOverviewPage: named(adminPages, 'AdminOverviewPage'),
  AdminResortsPage: named(adminPages, 'AdminResortsPage'),
  AdminResortPage: named(adminPages, 'AdminResortPage'),
  AdminUsersPage: named(adminPages, 'AdminUsersPage'),
  AdminBookingsPage: named(adminPages, 'AdminBookingsPage'),
  AdminBookingPage: named(adminPages, 'AdminBookingPage'),
  AdminReviewsPage: named(adminContent, 'AdminReviewsPage'),
  AdminDestinationsPage: named(adminContent, 'AdminDestinationsPage'),
  AdminCouponsPage: named(adminContent, 'AdminCouponsPage'),
  AdminSettingsPage: named(adminContent, 'AdminSettingsPage'),
  AdminAuditPage: named(adminContent, 'AdminAuditPage'),
  CheckoutPage: lazy(() => import('../pages/booking/CheckoutPage')),
  PaymentPage: lazy(() => import('../pages/booking/PaymentPage')),
  TripsPage: named(tripPages, 'TripsPage'),
  TripPage: named(tripPages, 'TripPage'),
}
const page = (Component) => (
  <Suspense fallback={<FullPageSpinner />}>
    <Component />
  </Suspense>
)

// Routes that later phases implement. Listed here so every link in the UI resolves.
const UPCOMING = [
  { path: 'help', title: 'Help centre', phase: 11 },
  { path: 'help/cancellations', title: 'Cancellations & refunds', phase: 11 },
  { path: 'contact', title: 'Contact us', phase: 11 },
  { path: 'terms', title: 'Terms of use', phase: 12 },
  { path: 'privacy', title: 'Privacy policy', phase: 12 },
]

export const routes = [
  {
    path: '/',
    element: <PublicLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'credits', element: <CreditsPage /> },
      { path: 'destinations', element: <DestinationsPage /> },
      { path: 'destinations/:slug', element: <DestinationPage /> },
      { path: 'resorts/:slug', element: <ResortPage /> },
      { path: 'owners', element: page(L.OwnersLandingPage) },
      { path: 'login', element: <LoginPage /> },
      { path: 'signup', element: <SignupPage /> },
      { path: 'owners/register', element: <SignupPage accountType="owner" /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'verify-email', element: <VerifyEmailPage /> },
      {
        element: <RequireAuth />,
        children: [{ path: 'account', element: <AccountPage /> }],
      },
      {
        path: 'owner',
        element: (
          <RequireAuth roles={['owner']}>{page(L.OwnerShell)}</RequireAuth>
        ),
        children: [
          { index: true, element: page(L.OwnerDashboardPage) },
          { path: 'resorts', element: page(L.OwnerResortsPage) },
          { path: 'resorts/:resortId', element: page(L.ResortEditorPage) },
          { path: 'calendar', element: page(L.OwnerCalendarPage) },
          { path: 'bookings', element: page(L.OwnerBookingsPage) },
          { path: 'bookings/:bookingId', element: page(L.OwnerBookingPage) },
          { path: 'reviews', element: page(L.OwnerReviewsPage) },
          { path: 'enquiries', element: page(L.OwnerEnquiriesPage) },
        ],
      },
      {
        path: 'admin',
        element: (
          <RequireAuth roles={['admin']}>{page(L.AdminShell)}</RequireAuth>
        ),
        children: [
          { index: true, element: page(L.AdminOverviewPage) },
          { path: 'resorts', element: page(L.AdminResortsPage) },
          { path: 'resorts/:resortId', element: page(L.AdminResortPage) },
          { path: 'users', element: page(L.AdminUsersPage) },
          { path: 'bookings', element: page(L.AdminBookingsPage) },
          { path: 'bookings/:bookingId', element: page(L.AdminBookingPage) },
          { path: 'reviews', element: page(L.AdminReviewsPage) },
          { path: 'destinations', element: page(L.AdminDestinationsPage) },
          { path: 'coupons', element: page(L.AdminCouponsPage) },
          { path: 'settings', element: page(L.AdminSettingsPage) },
          { path: 'audit', element: page(L.AdminAuditPage) },
        ],
      },
      // Checkout is open to everyone: guests create their account there.
      { path: 'checkout', element: page(L.CheckoutPage) },
      {
        element: <RequireAuth roles={['customer']} />,
        children: [
          { path: 'favourites', element: <FavouritesPage /> },
          { path: 'checkout/:bookingId', element: page(L.PaymentPage) },
          { path: 'trips', element: page(L.TripsPage) },
          { path: 'trips/:bookingId', element: page(L.TripPage) },
        ],
      },
      ...UPCOMING.map(({ path, title, phase }) => ({
        path,
        element: <ComingSoonPage title={title} phase={phase} />,
      })),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
