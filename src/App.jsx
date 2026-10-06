import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import RequireRole, { RequireNav } from './router/RequireRole';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Mines from './pages/Mines';
import MineDetail from './pages/MineDetail';
import Issues from './pages/Issues';
import IssueDetail from './pages/IssueDetail';
import CorrectiveActions from './pages/CorrectiveActions';
import CorrectiveActionDetail from './pages/CorrectiveActionDetail';
import Verification from './pages/Verification';
import VerificationDetail from './pages/VerificationDetail';
import Inspections from './pages/Inspections';
import NewInspection from './pages/NewInspection';
import AuditTrail from './pages/AuditTrail';
import Notifications from './pages/Notifications';
import Contractors from './pages/Contractors';
import ContractorDetail from './pages/ContractorDetail';
import Documents from './pages/Documents';
import DocumentUpload from './pages/DocumentUpload';
import DocumentDetail from './pages/DocumentDetail';
import RiskMap from './pages/RiskMap';
import Profile from './pages/Profile';
import PlaceholderPage from './pages/PlaceholderPage';

// Analytics pulls in the charting library (the largest dependency), so it loads on first visit
// instead of with the rest of the app.
const Analytics = React.lazy(() => import('./pages/Analytics'));
const RiskEngine = React.lazy(() => import('./pages/RiskEngine'));
const PageLoading = () => <p className="text-sm text-text-secondary" role="status">Loading analytics…</p>;

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <RequireRole>
            <AppShell />
          </RequireRole>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />

        <Route path="/mines" element={<Mines />} />
        <Route path="/mines/:mineId" element={<MineDetail />} />

        <Route path="/inspections" element={<Inspections />} />
        <Route path="/inspections/new" element={<NewInspection />} />

        <Route path="/issues" element={<Issues />} />
        <Route path="/issues/:issueId" element={<IssueDetail />} />

        <Route
          path="/corrective-actions"
          element={
            <RequireNav navId="correctiveActions">
              <CorrectiveActions />
            </RequireNav>
          }
        />
        <Route
          path="/corrective-actions/:actionId"
          element={
            <RequireNav navId="correctiveActions">
              <CorrectiveActionDetail />
            </RequireNav>
          }
        />
        <Route
          path="/verification"
          element={
            <RequireNav navId="verification">
              <Verification />
            </RequireNav>
          }
        />
        <Route
          path="/verification/:actionId"
          element={
            <RequireNav navId="verification">
              <VerificationDetail />
            </RequireNav>
          }
        />
        <Route path="/audit-trail" element={<AuditTrail />} />
        <Route path="/notifications" element={<Notifications />} />

        <Route path="/analytics" element={<RequireNav navId="analytics"><React.Suspense fallback={<PageLoading />}><Analytics /></React.Suspense></RequireNav>} />
        <Route path="/analytics/risk-engine" element={<RequireNav navId="analytics"><React.Suspense fallback={<PageLoading />}><RiskEngine /></React.Suspense></RequireNav>} />
        <Route path="/contractors" element={<RequireNav navId="contractors"><Contractors /></RequireNav>} />
        <Route path="/contractors/:contractorId" element={<RequireNav navId="contractors"><ContractorDetail /></RequireNav>} />
        <Route path="/documents" element={<RequireNav navId="documents"><Documents /></RequireNav>} />
        <Route path="/documents/upload" element={<RequireNav navId="documents"><DocumentUpload /></RequireNav>} />
        <Route path="/documents/:documentId" element={<RequireNav navId="documents"><DocumentDetail /></RequireNav>} />
        <Route path="/risk-map" element={<RequireNav navId="riskMap"><RiskMap /></RequireNav>} />

        <Route path="/profile" element={<RequireNav navId="profile"><Profile /></RequireNav>} />

        <Route path="/admin/users" element={<RequireNav navId="admin"><PlaceholderPage title="Manage Users" buildStep="Step 6" /></RequireNav>} />
        <Route path="/admin/mines" element={<RequireNav navId="admin"><PlaceholderPage title="Manage Mines" buildStep="Step 6" /></RequireNav>} />
        <Route path="/admin/contractors" element={<RequireNav navId="admin"><PlaceholderPage title="Manage Contractors" buildStep="Step 6" /></RequireNav>} />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
