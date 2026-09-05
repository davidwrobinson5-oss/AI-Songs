import './globals.css';
import './pie-brand.css';
import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import PasskeySetupBanner from './PasskeySetupBanner';
import AccountControl from './AccountControl';
import AudioPolicy from './AudioPolicy';
import CloudSongSync from './CloudSongSync';
import PwaBoot from './PwaBoot';
import ProcessingRetryAssist from './ProcessingRetryAssist';
import OriginalityScoreOverlay from './OriginalityScoreOverlay';
import SongScoreOverlay from './SongScoreOverlay';

export const metadata: Metadata = {
  title: 'Pieinears',
  description: 'Pieinears — The Kitchens Open. Let Them Cook!',
  manifest: '/manifest.webmanifest',
  themeColor: '#05070A',
  appleWebApp: {
    capable: true,
    title: 'Pie',
    statusBarStyle: 'black-translucent',
  },
};

function clerkConfigured() {
  return Boolean(
    process.env.PIE_ENABLE_CLERK === '1' &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY,
  );
}

function Document({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PwaBoot />
        <AudioPolicy />
        <ProcessingRetryAssist />
        <OriginalityScoreOverlay />
        <SongScoreOverlay />
        <CloudSongSync />
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
