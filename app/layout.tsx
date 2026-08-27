import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Songs',
  description: 'Mobile-first AI songwriting studio',
  manifest: '/manifest.webmanifest',
  themeColor: '#0b0b12',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
