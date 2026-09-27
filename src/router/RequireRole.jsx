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
