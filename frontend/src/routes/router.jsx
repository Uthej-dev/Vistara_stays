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

// Routes that later phases implement. Listed here so every link in the UI resolves.
const UPCOMING = [
  { path: 'trips', title: 'Your trips', phase: 7 },
  { path: 'owners', title: 'List your property', phase: 8 },
  { path: 'owner', title: 'Owner dashboard', phase: 8 },
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
        element: <RequireAuth roles={['customer']} />,
        children: [{ path: 'favourites', element: <FavouritesPage /> }],
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
