import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ระดับน้ำสมุทรสงคราม',
    short_name: 'น้ำสมุทรสงคราม',
    description: 'ติดตามระดับน้ำและน้ำทะเลหนุนในสมุทรสงครามแบบเรียลไทม์',
    start_url: '/',
    display: 'standalone',
    background_color: '#071219',
    theme_color: '#071219',
    lang: 'th',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}