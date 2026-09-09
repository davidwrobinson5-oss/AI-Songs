'use client';

import { SignIn } from '@clerk/nextjs';

export default function ClerkEmailLogin() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
      <SignIn
        routing="path"
        path="/signin"
        oauthFlow="redirect"
        fallback={<div style={{ minHeight: 220, display: 'grid', placeItems: 'center', color: '#b8b9be' }}>Loading secure sign-in…</div>}
        forceRedirectUrl="/"
        fallbackRedirectUrl="/"
        signUpUrl="/signup"
        appearance={{
          variables: {
            colorPrimary: '#7254a8',
            colorPrimaryForeground: '#ffffff',
            colorForeground: '#f2f2f3',
            colorMutedForeground: '#b8b9be',
            colorBackground: '#303136',
            colorInput: '#25262a',
            colorInputForeground: '#f5f5f6',
            colorBorder: '#515258',
            colorNeutral: '#a9aab0',
            colorRing: '#8a6bc0',
            borderRadius: '16px',
          },
          elements: {
            rootBox: { width: '100%', maxWidth: '520px' },
            cardBox: { width: '100%' },
            card: {
              width: '100%',
              background: '#303136',
              color: '#f2f2f3',
              border: '1px solid #515258',
              borderRadius: '22px',
              boxShadow: '0 20px 60px rgba(0,0,0,.28)',
            },
            headerTitle: { color: '#f7f7f8', fontWeight: 800 },
            headerSubtitle: { color: '#b8b9be' },
            socialButtonsBlockButton: {
              background: '#3a3b40',
              color: '#f7f7f8',
              border: '1px solid #5b5c62',
              minHeight: '50px',
              borderRadius: '14px',
              fontWeight: 800,
            },
            dividerLine: { background: '#55565c' },
            dividerText: { color: '#a9aab0' },
            formFieldLabel: { color: '#d7d8db', fontWeight: 700 },
            formFieldInput: {
              background: '#25262a',
              color: '#f5f5f6',
              border: '1px solid #55565c',
              minHeight: '50px',
              borderRadius: '14px',
              boxShadow: 'none',
            },
            formFieldInputShowPasswordButton: { color: '#b8b9be' },
            formButtonPrimary: {
              background: '#7254a8',
              color: '#ffffff',
              minHeight: '52px',
              borderRadius: '14px',
              fontWeight: 800,
              fontSize: '16px',
              boxShadow: '0 8px 20px rgba(42,31,63,.24)',
            },
            footer: { background: '#2b2c30' },
            footerActionText: { color: '#b8b9be' },
            footerActionLink: { color: '#d7c8f1', fontWeight: 700 },
            identityPreviewText: { color: '#f2f2f3' },
            identityPreviewEditButton: { color: '#d7c8f1', fontWeight: 700 },
          },
        }}
      />
    </div>
  );
}
