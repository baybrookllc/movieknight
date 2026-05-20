'use client';

import { useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { debugLogger } from '@/lib/debug-logger';

/**
 * Initialises the browser-side debug logger once the user session is known.
 * Must be rendered inside <AuthProvider>.
 * Tears down cleanly on unmount.
 */
export default function DebugProvider() {
  const { user } = useAuth();

  useEffect(() => {
    debugLogger.init(user?.id ?? undefined);
    return () => {
      debugLogger.destroy();
    };
  // Re-init if the user changes (sign-in / sign-out)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return null;
}
