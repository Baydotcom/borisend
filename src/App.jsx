import { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ThemeProvider from '@/components/ThemeProvider';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ReferralLinkCapture from './components/referral/ReferralLinkCapture';
import RootDeepLinkHandler from '@/components/mobile/RootDeepLinkHandler';
import NativeShellInit from '@/components/mobile/NativeShellInit';
import GeofenceController from '@/components/mobile/GeofenceController';
import NativePushController from '@/components/mobile/NativePushController';
import ProtectedRoute from '@/components/ProtectedRoute';
import StartupScreen from '@/components/StartupScreen';
import { I18nProvider } from '@/lib/I18nContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import AdminRoute from '@/components/AdminRoute';
import AdminLayout from '@/components/layout/AdminLayout';

// Route-level code splitting keeps the initial web bundle lean.
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const ManageUsers = lazy(() => import('@/pages/admin/ManageUsers'));
const AdminUserDetail = lazy(() => import('@/pages/admin/AdminUserDetail'));
const ManagePlans = lazy(() => import('@/pages/admin/ManagePlans'));
const ManageAnnouncements = lazy(() => import('@/pages/admin/ManageAnnouncements'));
const ManageReferrals = lazy(() => import('@/pages/admin/ManageReferrals'));
const TrialManagement = lazy(() => import('@/pages/admin/TrialManagement'));
const ManageCommercial = lazy(() => import('@/pages/admin/ManageCommercial'));
const AdminSettings = lazy(() => import('@/pages/admin/AdminSettings'));
const AdminCRM = lazy(() => import('@/pages/admin/AdminCRM'));
const AdminIntelligence = lazy(() => import('@/pages/admin/AdminIntelligence'));
const AdminMedia = lazy(() => import('@/pages/admin/AdminMedia'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const AppLayout = lazy(() => import('@/components/layout/AppLayout'));
const Home = lazy(() => import('@/pages/Home'));
const Campaigns = lazy(() => import('@/pages/Campaigns'));
const CreateCampaign = lazy(() => import('@/pages/CreateCampaign'));
const CampaignDetail = lazy(() => import('@/pages/CampaignDetail'));
const History = lazy(() => import('@/pages/History'));
const MessageDetail = lazy(() => import('@/pages/MessageDetail'));
const Settings = lazy(() => import('@/pages/Settings'));
const NotificationCenter = lazy(() => import('@/pages/NotificationCenter'));
const SmartInbox = lazy(() => import('@/pages/SmartInbox'));
const NotificationSettings = lazy(() => import('@/pages/NotificationSettings'));
const People = lazy(() => import('@/pages/People'));
const ContactDetail = lazy(() => import('@/pages/ContactDetail'));
const Profile = lazy(() => import('@/pages/Profile'));
const SmartMessages = lazy(() => import('@/pages/SmartMessages'));
const CreateSmartMessage = lazy(() => import('@/pages/CreateSmartMessage'));
const SmartMessageDetail = lazy(() => import('@/pages/SmartMessageDetail'));
const Support = lazy(() => import('@/pages/Support'));
const MarketingPage = lazy(() => import('@/pages/marketing/MarketingPage'));

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return <StartupScreen />;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <>
      <NativeShellInit />
      <NativePushController />
      <GeofenceController />
      <RootDeepLinkHandler />
      <Suspense fallback={<StartupScreen />}>
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/marketing-preview" element={<MarketingPage />} />

      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/campaigns/new" element={<CreateCampaign />} />
          <Route path="/campaigns/:id" element={<CampaignDetail />} />
          <Route path="/campaigns/:id/edit" element={<CreateCampaign />} />
          <Route path="/history" element={<History />} />
          <Route path="/inbox" element={<SmartInbox />} />
          <Route path="/notifications" element={<NotificationCenter />} />
          <Route path="/messages/:id" element={<MessageDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/notification-settings" element={<NotificationSettings />} />
          <Route path="/subscription" element={<Navigate to="/settings" replace />} />
          <Route path="/referrals" element={<Navigate to="/settings" replace />} />
          <Route path="/people" element={<People />} />
          <Route path="/people/:id" element={<ContactDetail />} />
          <Route path="/smart-messages" element={<SmartMessages />} />
          <Route path="/smart-messages/new" element={<CreateSmartMessage />} />
          <Route path="/smart-messages/:id" element={<SmartMessageDetail />} />
          <Route path="/smart-messages/:id/edit" element={<CreateSmartMessage />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/support" element={<Support />} />
        </Route>

      </Route>

      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          <Route path="/admin/users" element={<AdminRoute><ManageUsers /></AdminRoute>} />
          <Route path="/admin/users/:id" element={<AdminRoute><AdminUserDetail /></AdminRoute>} />
          <Route path="/admin/plans" element={<AdminRoute><ManagePlans /></AdminRoute>} />
          <Route path="/admin/announcements" element={<AdminRoute><ManageAnnouncements /></AdminRoute>} />
          <Route path="/admin/referrals" element={<AdminRoute><ManageReferrals /></AdminRoute>} />
          <Route path="/admin/trial" element={<AdminRoute><TrialManagement /></AdminRoute>} />
          <Route path="/admin/commercial" element={<AdminRoute><ManageCommercial /></AdminRoute>} />
          <Route path="/admin/settings" element={<AdminRoute><AdminSettings /></AdminRoute>} />
          <Route path="/admin/crm" element={<AdminRoute><AdminCRM /></AdminRoute>} />
          <Route path="/admin/intelligence" element={<AdminRoute><AdminIntelligence /></AdminRoute>} />
          <Route path="/admin/media" element={<AdminRoute><AdminMedia /></AdminRoute>} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
      </Routes>
      </Suspense>
    </>
  );
};

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <I18nProvider>
          <QueryClientProvider client={queryClientInstance}>
            <Router>
              <ErrorBoundary>
                <ScrollToTop />
                <ReferralLinkCapture />
                <AuthenticatedApp />
              </ErrorBoundary>
            </Router>
            <Toaster />
          </QueryClientProvider>
        </I18nProvider>
      </ThemeProvider>
    </AuthProvider>
  )
}

export default App