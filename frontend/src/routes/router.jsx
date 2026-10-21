import { createBrowserRouter } from 'react-router'
import PublicLayout from '../layouts/PublicLayout'
import HomePage from '../pages/HomePage'
import SearchPage from '../pages/SearchPage'
import CreditsPage from '../pages/CreditsPage'
import ComingSoonPage from '../pages/ComingSoonPage'
import NotFoundPage from '../pages/NotFoundPage'

// Routes that later phases implement. Listed here so every link in the UI resolves.
const UPCOMING = [
  { path: 'destinations', title: 'All destinations', phase: 4 },
  { path: 'destinations/:slug', title: 'Destination guide', phase: 4 },
  { path: 'resorts/:slug', title: 'Resort details', phase: 6 },
  { path: 'login', title: 'Log in', phase: 5 },
  { path: 'signup', title: 'Create an account', phase: 5 },
  { path: 'favourites', title: 'Your favourites', phase: 5 },
  { path: 'trips', title: 'Your trips', phase: 7 },
  { path: 'owners', title: 'List your property', phase: 8 },
  { path: 'owners/register', title: 'Create an owner account', phase: 8 },
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
      ...UPCOMING.map(({ path, title, phase }) => ({
        path,
        element: <ComingSoonPage title={title} phase={phase} />,
      })),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
