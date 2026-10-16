'use client';

import dynamic from 'next/dynamic';

const DashboardClient = dynamic(
  () => import('../components/DashboardClient').then((mod) => mod.DashboardClient),
  {
    ssr: false,
    loading: () => (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#090d16', color: '#fff' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>WiCare Central Hub</div>
          <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Loading live telemetry dashboard...</div>
        </div>
      </div>
    ),
  }
);

export default function HomePage() {
  return <DashboardClient />;
}
