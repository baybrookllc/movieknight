'use client';

import { useNav } from '@/components/NavProvider';

export default function MobileOverlay() {
  const { mobileOpen, close } = useNav();
  if (!mobileOpen) return null;
  return (
    <div
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        top: 'var(--header-height)',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 199,
      }}
      className="mobile-overlay"
    />
  );
}
