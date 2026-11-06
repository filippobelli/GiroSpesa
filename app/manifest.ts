import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'GiroSpesa — La spesa, in ordine',
    short_name: 'GiroSpesa',
    description: 'La lista di casa che conosce il percorso del tuo supermercato.',
    start_url: '/',
    display: 'standalone',
    background_color: '#fafbf9',
    theme_color: '#527e65',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
