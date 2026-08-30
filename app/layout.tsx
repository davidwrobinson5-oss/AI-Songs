import './globals.css';
import './pie-brand.css';
import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import PasskeySetupBanner from './PasskeySetupBanner';
import AccountControl from './AccountControl';
import AudioPolicy from './AudioPolicy';
import CloudSongSync from './CloudSongSync';

export const metadata: Metadata = {
  title: 'Pieinears',
  description: 'Pieinears — The Kitchens Open. Let Them Cook!',
  manifest: '/manifest.webmanifest',
  themeColor: '#05070A',
};

function clerkConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

function Document({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AudioPolicy />
        <a className="globalPieMark" href="/" aria-label="PieInEars home">
          <img src="/pieinears-mark.svg" alt="PieInEars" />
        </a>
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
        <CloudSongSync />
        <PasskeySetupBanner />
        <AccountControl />
      </Document>
    </ClerkProvider>
  );
}
