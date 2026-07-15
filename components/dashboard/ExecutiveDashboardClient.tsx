'use client';

import { useState } from 'react';
import TechStackTab from './TechStackTab';
import ArchitectureTab from './ArchitectureTab';
import HealthMetricsTab from './HealthMetricsTab';

interface ExecutiveDashboardClientProps {
  initialMetrics: {
    titles: number;
    users: number;
    editions: number;
    timestamp: string;
    edgeFunctions: Array<{
      name: string;
      desc: string;
      status: 'online' | 'offline';
      latency: number;
    }>;
  };
}

export default function ExecutiveDashboardClient({ initialMetrics }: ExecutiveDashboardClientProps) {
  const [activeTab, setActiveTab] = useState<'stack' | 'architecture' | 'health'>('stack');

  const tabs = [
    { id: 'stack', label: 'Tech Stack & Scope' },
    { id: 'architecture', label: 'Codebase Architecture' },
    { id: 'health', label: 'Live Health Metrics' },
  ] as const;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>Executive Dashboard</h1>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          MovieKnight v6.21
        </div>
      </div>

      {/* Tabs Navigation */}
      <div style={{ 
        display: 'flex', 
        gap: 8, 
        borderBottom: '1px solid var(--border)', 
        marginBottom: 24,
        overflowX: 'auto',
        scrollbarWidth: 'none'
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--text)' : 'var(--text-muted)',
              fontSize: 14,
              fontWeight: activeTab === tab.id ? 600 : 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s ease'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ minHeight: 400 }}>
        {activeTab === 'stack' && <TechStackTab />}
        {activeTab === 'architecture' && <ArchitectureTab />}
        {activeTab === 'health' && <HealthMetricsTab initialMetrics={initialMetrics} />}
      </div>
    </div>
  );
}
