import { Suspense } from 'react';
import BrowseClient from '@/components/BrowseClient';

export default function BrowsePage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
        <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    }>
      <BrowseClient />
    </Suspense>
  );
}
