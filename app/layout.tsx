import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'GiroSpesa — La spesa, in ordine',
  description: 'La lista di casa che conosce il percorso del tuo supermercato.',
  applicationName: 'GiroSpesa',
  appleWebApp: { capable: true, title: 'GiroSpesa', statusBarStyle: 'default' },
  icons: { icon: ['/icon-192.png', '/icon-512.png'], apple: '/apple-icon.png' },
};
export const viewport = { themeColor: '#527e65', width: 'device-width', initialScale: 1, maximumScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="it"><body>{children}</body></html>; }
