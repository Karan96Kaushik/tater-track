import { Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Analytics } from '@vercel/analytics/react';
import { AppShell } from '@/components/layout/AppShell';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { SignInCard } from '@/components/auth/SignInCard';
import { DiscoverView } from '@/components/media/DiscoverView';
import { LibraryView } from '@/components/media/LibraryView';
import { UpcomingView } from '@/components/upcoming/UpcomingView';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { AuthProvider } from '@/hooks/useAuth';
import { LibraryProvider } from '@/hooks/useLibrary';

export default function App() {
  return (
    <AuthProvider>
      <LibraryProvider>
        <Routes>
          <Route path="/login" element={<SignInCard />} />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<LibraryView />} />
            <Route path="discover" element={<DiscoverView />} />
            <Route path="upcoming" element={<UpcomingView />} />
            <Route path="settings" element={<SettingsPanel />} />
            <Route path="*" element={<LibraryView />} />
          </Route>
        </Routes>
        <Toaster theme="dark" position="top-center" richColors />
        {import.meta.env.PROD && <Analytics />}
      </LibraryProvider>
    </AuthProvider>
  );
}
