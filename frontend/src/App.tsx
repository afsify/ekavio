/**
 * Main Application Router (`App.tsx`)
 * Functional React component configuring BrowserRouter, ThemeProvider wrapper,
 * Protected routes, and Toast notifications.
 */
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { useAppStore } from "./store/useAppStore";
import { ThemeProvider } from "./components/ThemeProvider";
import { AdminLayout } from "./components/layout/AdminLayout";
import { PublicLayout } from "./components/layout/PublicLayout";
import { Login } from "./pages/Login";
import { hasEntitlement, MODULES, type ModuleKey } from './commercial/catalogue';

const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const LedgerPage = React.lazy(() => import("./pages/Ledger/LedgerPage"));
const AttendancePage = React.lazy(
  () => import("./pages/Attendance/AttendancePage"),
);
const QueuePage = React.lazy(() => import("./pages/Queue/QueuePage"));
const AppointmentsPage = React.lazy(() => import('./pages/Appointments/AppointmentsPage'));
const InventoryPage = React.lazy(
  () => import("./pages/Inventory/InventoryPage"),
);
const CorporateDashboard = React.lazy(
  () => import("./pages/Corporate/CorporateDashboard"),
);
const StaffManagementPage = React.lazy(
  () => import("./pages/Staff/StaffManagementPage"),
);
const SettingsPage = React.lazy(() => import("./pages/Settings/SettingsPage"));
const BillingPage = React.lazy(() => import("./pages/Billing/BillingPage"));
const LandingPage = React.lazy(() => import("./pages/Landing/LandingPage"));

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

interface ModuleGuardProps {
  module: ModuleKey;
  children: React.ReactNode;
}

const ModuleGuard: React.FC<ModuleGuardProps> = ({ module, children }) => {
  const entitlements = useAppStore((state) => state.entitlements);

  if (!hasEntitlement(entitlements, module)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-5rem)] p-6 text-center">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl max-w-md shadow-2xl">
          <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Upgrade Required</h2>
          <p className="text-slate-400 mb-6">
            Your organization does not currently have access to the <span className="text-indigo-400 font-semibold capitalize">{module}</span> module.
          </p>
          <a
            href="/billing"
            className="block w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200"
          >
            View Subscription
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

const UnavailableFeature: React.FC<{ name: string }> = ({ name }) => (
  <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center p-6 text-center">
    <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
      <h2 className="text-2xl font-bold text-white">{name} is not available</h2>
      <p className="mt-3 text-slate-400">
        This workflow is deferred and is not part of the commercial module catalogue.
      </p>
    </div>
  </div>
);

const PermissionGuard: React.FC<{ permission: string; children: React.ReactNode }> = ({
  permission,
  children,
}) => {
  const permissions = useAppStore((state) => state.user?.permissions ?? []);
  return permissions.includes(permission) ? <>{children}</> : <Navigate to="/dashboard" replace />;
};

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-slate-950">
    <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
  </div>
);

export const App: React.FC = () => {
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const isBootstrapping = useAppStore((state) => state.isBootstrapping);

  if (isBootstrapping) {
    return (
      <ThemeProvider>
        <PageLoader />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#0f172a",
              color: "#f8fafc",
              border: "1px solid #334155",
            },
            success: {
              iconTheme: {
                primary: "#10b981",
                secondary: "#f8fafc",
              },
            },
          }}
        />
        <React.Suspense fallback={<PageLoader />}>
          <Routes>
            <Route
              path="/login"
              element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />}
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <AdminLayout>
                    <Dashboard />
                  </AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/ledger"
              element={
                <ProtectedRoute>
                  <AdminLayout>
                    <ModuleGuard module={MODULES.LEDGER}>
                      <LedgerPage />
                    </ModuleGuard>
                  </AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/attendance"
              element={
                <ProtectedRoute>
                  <AdminLayout>
                    <ModuleGuard module={MODULES.ATTENDANCE}>
                      <AttendancePage />
                    </ModuleGuard>
                  </AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/queue"
              element={
                <ProtectedRoute>
                  <AdminLayout>
                    <ModuleGuard module={MODULES.QUEUE}>
                      <QueuePage />
                    </ModuleGuard>
                  </AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/appointments"
              element={
                <ProtectedRoute>
                  <AdminLayout>
                    <ModuleGuard module={MODULES.QUEUE}>
                      <AppointmentsPage />
                    </ModuleGuard>
                  </AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory"
              element={
                <ProtectedRoute>
                  <AdminLayout>
                    <ModuleGuard module={MODULES.INVENTORY}>
                      <InventoryPage />
                    </ModuleGuard>
                  </AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/chat"
              element={
                <ProtectedRoute>
                  <AdminLayout>
                    <UnavailableFeature name="Messages" />
                  </AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/corporate"
              element={
                <ProtectedRoute>
                  <AdminLayout>
                    <PermissionGuard permission="corporate.manage"><CorporateDashboard /></PermissionGuard>
                  </AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/billing"
              element={
                <ProtectedRoute>
                  <AdminLayout>
                    <PermissionGuard permission="billing.read"><BillingPage /></PermissionGuard>
                  </AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/staff"
              element={
                <ProtectedRoute>
                  <AdminLayout>
                    <PermissionGuard permission="staff.read"><StaffManagementPage /></PermissionGuard>
                  </AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <AdminLayout>
                    <PermissionGuard permission="organization.manage"><SettingsPage /></PermissionGuard>
                  </AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/"
              element={
                <PublicLayout>
                  <LandingPage />
                </PublicLayout>
              }
            />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </React.Suspense>
      </BrowserRouter>
    </ThemeProvider>
  );
};

export default App;
