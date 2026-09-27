import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { storage } from '../storage/localStorage';
import { ROLE_DETAILS, canAccess } from '../data/roles';
import { ensureSeeded } from '../services/seedService';

const RoleContext = createContext(null);

export function RoleProvider({ children }) {
  useEffect(() => {
    ensureSeeded();
  }, []);

  const [role, setRoleState] = useState(() => storage.read(storage.KEYS.CURRENT_ROLE, null));

  useEffect(() => {
    if (role) {
      storage.write(storage.KEYS.CURRENT_ROLE, role);
    }
  }, [role]);

  const setRole = (roleId) => {
    if (!ROLE_DETAILS[roleId]) return;
    setRoleState(roleId);
  };

  const logout = () => {
    storage.remove(storage.KEYS.CURRENT_ROLE);
    setRoleState(null);
  };

  const value = useMemo(
    () => ({
      role,
      roleDetails: role ? ROLE_DETAILS[role] : null,
      setRole,
      logout,
      canAccess: (navId) => (role ? canAccess(navId, role) : false),
    }),
    [role]
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used within a RoleProvider');
  return ctx;
}
