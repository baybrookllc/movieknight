import dynamic from 'next/dynamic';
import { AuthProvider } from '@/components/AuthProvider';
import { ToastProvider } from '@/components/Toast';
import { BadgeProvider } from '@/components/BadgeProvider';
import { NavProvider } from '@/components/NavProvider';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import MobileOverlay from '@/components/MobileOverlay';
import AppFooter from '@/components/AppFooter';
import DebugProvider from '@/components/DebugProvider';

// Loaded in a separate JS chunk — SearchOverlay renders null when closed
const SearchOverlay = dynamic(() => import('@/components/SearchOverlay'));
const GlobalListModal = dynamic(() => import('@/components/GlobalListModal'));
const BulkActionBar = dynamic(() => import('@/components/BulkActionBar'));

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <BadgeProvider>
          <NavProvider>
            {/* Captures console logs, errors, network timings, and Core Web Vitals */}
            <DebugProvider />
            <a href="#main-content" className="skip-link">Skip to main content</a>
            <div className="app-shell">
              <Header />
              <Sidebar />
              <MobileOverlay />
              <main id="main-content" tabIndex={-1} className="app-main">
                {children}
              </main>
              <AppFooter />
            </div>
            <SearchOverlay />
            <GlobalListModal />
            <BulkActionBar />
          </NavProvider>
        </BadgeProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
