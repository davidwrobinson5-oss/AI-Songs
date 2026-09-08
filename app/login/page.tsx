import type { Metadata } from 'next';
import LegacyLoginForm from './LegacyLoginForm';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function LoginPage() {
  return <LegacyLoginForm />;
}
