import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import RequireRole from './router/RequireRole';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Mines from './pages/Mines';
import MineDetail from './pages/MineDetail';
import Issues from './pages/Issues';
import IssueDetail from './pages/IssueDetail';
import CorrectiveActions from './pages/CorrectiveActions';
import PlaceholderPage from './pages/PlaceholderPage';

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

        <Route path="/inspections" element={<PlaceholderPage title="Inspections" buildStep="Step 3" />} />
        <Route path="/inspections/new" element={<PlaceholderPage title="New Inspection" buildStep="Step 3" />} />

        <Route path="/issues" element={<Issues />} />
        <Route path="/issues/:issueId" element={<IssueDetail />} />

        <Route path="/corrective-actions" element={<CorrectiveActions />} />
        <Route path="/verification" element={<PlaceholderPage title="Verification & Closure" buildStep="Step 4" />} />
        <Route path="/audit-trail" element={<PlaceholderPage title="Audit Trail" buildStep="Step 4" />} />
        <Route path="/notifications" element={<PlaceholderPage title="Notifications" buildStep="Step 4" />} />

        <Route path="/analytics" element={<PlaceholderPage title="Analytics" buildStep="Step 5" />} />
        <Route path="/analytics/risk-engine" element={<PlaceholderPage title="Risk Engine" buildStep="Step 3" />} />
        <Route path="/contractors" element={<PlaceholderPage title="Contractors" buildStep="Step 5" />} />
        <Route path="/contractors/:contractorId" element={<PlaceholderPage title="Contractor Detail" buildStep="Step 5" />} />
        <Route path="/documents" element={<PlaceholderPage title="Documents / OCR" buildStep="Step 5" />} />
        <Route path="/documents/upload" element={<PlaceholderPage title="Upload Document" buildStep="Step 5" />} />
        <Route path="/risk-map" element={<PlaceholderPage title="Risk Map" buildStep="Step 5" />} />

        <Route path="/admin/users" element={<PlaceholderPage title="Manage Users" buildStep="Step 6" />} />
        <Route path="/admin/mines" element={<PlaceholderPage title="Manage Mines" buildStep="Step 6" />} />
        <Route path="/admin/contractors" element={<PlaceholderPage title="Manage Contractors" buildStep="Step 6" />} />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
