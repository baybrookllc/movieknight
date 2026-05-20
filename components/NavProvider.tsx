'use client';

import { createContext, useContext, useState, useCallback } from 'react';

interface NavContextValue {
  mobileOpen: boolean;
  toggle: () => void;
  close: () => void;
}

const NavContext = createContext<NavContextValue>({
  mobileOpen: false,
  toggle: () => {},
  close: () => {},
});

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggle = useCallback(() => setMobileOpen(v => !v), []);
  const close = useCallback(() => setMobileOpen(false), []);
  return (
    <NavContext.Provider value={{ mobileOpen, toggle, close }}>
      {children}
    </NavContext.Provider>
  );
}

export const useNav = () => useContext(NavContext);
