import { Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Analytics } from '@vercel/analytics/react';
import { AppShell } from '@/components/layout/AppShell';
import { RequireAuth, SignedInOnly } from '@/components/auth/RequireAuth';
import { ResetPassword } from '@/components/auth/ResetPassword';
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
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route
              index
              element={
                <SignedInOnly>
                  <LibraryView />
                </SignedInOnly>
              }
            />
            <Route path="discover" element={<DiscoverView />} />
            <Route
              path="upcoming"
              element={
                <SignedInOnly>
                  <UpcomingView />
                </SignedInOnly>
              }
            />
            <Route
              path="settings"
              element={
                <SignedInOnly>
                  <SettingsPanel />
                </SignedInOnly>
              }
            />
            <Route
              path="*"
              element={
                <SignedInOnly>
                  <LibraryView />
                </SignedInOnly>
              }
            />
          </Route>
        </Routes>
        <Toaster theme="dark" position="top-center" richColors />
        {import.meta.env.PROD && <Analytics />}
      </LibraryProvider>
    </AuthProvider>
  );
}
