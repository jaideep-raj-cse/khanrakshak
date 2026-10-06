import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

// Below the Tailwind `md` breakpoint (768px) the sidebar starts collapsed to its
// 64px icon rail instead of the full 248px, so a tablet/phone viewport doesn't
// lose most of the screen to it on first load; the user can still expand it with
// the existing toggle. This only sets the INITIAL state — resizing an already-open
// session doesn't fight the user's manual choice.
function getInitialCollapsed() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768;
}

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-text-primary">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
