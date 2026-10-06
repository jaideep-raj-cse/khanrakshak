import React from 'react';
import { Navigate } from 'react-router-dom';
import { useRole } from '../context/RoleContext';

// Gates the authenticated app shell behind a selected demo persona.
// This is a prototype convenience, not real session/auth enforcement.
export default function RequireRole({ children }) {
  const { role } = useRole();
  if (!role) return <Navigate to="/login" replace />;
  return children;
}

// Step 4: page-level nav guard. Some pages (e.g. /verification) are only
// permitted for certain roles per the NAV_PERMISSIONS matrix in
// src/data/roles.js. Sidebar links already hide these, but per the Step 4
// spec (section 21) that isn't enough — a role must not gain access simply
// by navigating to the URL directly, so the route itself re-checks
// canAccess() and redirects if the current role isn't allowed.
export function RequireNav({ navId, children }) {
  const { role, canAccess } = useRole();
  if (!role) return <Navigate to="/login" replace />;
  if (!canAccess(navId)) return <Navigate to="/dashboard" replace />;
  return children;
}
