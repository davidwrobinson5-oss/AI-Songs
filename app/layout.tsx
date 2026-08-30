import './globals.css';
import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import PasskeySetupBanner from './PasskeySetupBanner';
import AccountControl from './AccountControl';
import AudioPolicy from './AudioPolicy';

export const metadata: Metadata = {
  title: 'Pie',
  description: 'Pieinears — the creative kitchen for music.',
  manifest: '/manifest.webmanifest',
  themeColor: '#070914',
};

function clerkConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

function Document({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AudioPolicy />
        {children}
      </body>
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
      <Document>
        {children}
        <PasskeySetupBanner />
        <AccountControl />
      </Document>
    </ClerkProvider>
  );
}
