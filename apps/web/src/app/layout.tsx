import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WiCare — Patient Monitoring Dashboard',
  description: 'Local, software-simulated wireless patient-monitoring system',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
