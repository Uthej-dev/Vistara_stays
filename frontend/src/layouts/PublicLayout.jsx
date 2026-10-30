import { Outlet, ScrollRestoration, useLocation } from 'react-router'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import AssistantMount from '../features/assistant/AssistantMount'

export default function PublicLayout() {
  const { pathname } = useLocation()
  const overlayNav = pathname === '/' // transparent navbar only over the home hero

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-forest-800 px-4 py-2 text-cream-50 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Navbar overlay={overlayNav} />
      <main id="main" className={overlayNav ? 'flex-1' : 'flex-1 pt-16'}>
        <Outlet />
      </main>
      <Footer />
      <AssistantMount />
      <ScrollRestoration />
    </div>
  )
}
