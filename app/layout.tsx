import './globals.css';
import './pie-brand.css';
import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import PasskeySetupBanner from './PasskeySetupBanner';
import AccountControl from './AccountControl';
import PrivateStudioAccountControl from './PrivateStudioAccountControl';
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

function clerkClientConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

function clerkFrontendApiProxyEnabled() {
  // Clerk's Frontend API proxy is only valid for Pie's production Clerk instance.
  // Preview currently uses Clerk development keys, so forcing /__clerk here causes
  // the browser SDK to fail before the sign-in form can render.
  return process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim().startsWith('pk_live_') === true;
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
  if (!clerkClientConfigured()) return <Document>{children}<PrivateStudioAccountControl /></Document>;

  const proxyProps = clerkFrontendApiProxyEnabled() ? { proxyUrl: '/__clerk' } : {};

  return (
    <ClerkProvider
      dynamic
      {...proxyProps}
      signInUrl="/signin"
      signUpUrl="/signup"
      afterSignOutUrl="/signin"
    >
      <Document>
        {children}
        <PasskeySetupBanner />
        <AccountControl />
      </Document>
    </ClerkProvider>
  );
}
