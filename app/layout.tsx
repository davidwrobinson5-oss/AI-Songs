import './globals.css';
import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';

export const metadata: Metadata = {
  title: 'AI Songs',
  description: 'Mobile-first AI songwriting studio',
  manifest: '/manifest.webmanifest',
  themeColor: '#0b0b12',
};

function clerkConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

function Document({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  if (!clerkConfigured()) return <Document>{children}</Document>;

  return (
    <ClerkProvider
      dynamic
      signInUrl="/login"
      signUpUrl="/login"
      afterSignOutUrl="/login"
    >
      <Document>{children}</Document>
    </ClerkProvider>
  );
}
