import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const readBuildUrl = (
  name: 'VITE_API_URL' | 'VITE_SOCKET_URL',
  value: string | undefined,
  mode: string,
): string => {
  if (!value) throw new Error(`${name} is required for the frontend build`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) URL`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${name} must use HTTP or HTTPS`);
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (mode === 'production' && parsed.protocol !== 'https:' && !loopback) {
    throw new Error(`${name} must use HTTPS for a hosted production build`);
  }
  return value;
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const environment = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  readBuildUrl('VITE_API_URL', environment.VITE_API_URL, mode);
  readBuildUrl('VITE_SOCKET_URL', environment.VITE_SOCKET_URL, mode);
  const publicUrl = new URL(environment.VITE_PUBLIC_APP_URL ?? 'https://ekavio.afsify.com');
  if (publicUrl.protocol !== 'https:' || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash || publicUrl.pathname !== '/') throw new Error('VITE_PUBLIC_APP_URL must be a credential-free HTTPS origin');
  const publicOrigin = publicUrl.origin;

  return {
    define: { 'import.meta.env.VITE_PUBLIC_APP_URL': JSON.stringify(publicOrigin) },
    plugins: [
      {
        name: 'ekavio-public-metadata',
        transformIndexHtml: (html: string) => html.replaceAll('%PUBLIC_APP_URL%', publicOrigin),
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /$\nAllow: /privacy$\nDisallow: /\nDisallow: /login\nDisallow: /onboarding\nDisallow: /forgot-password\nDisallow: /reset-password\nDisallow: /verify-email\nDisallow: /accept-invitation\nDisallow: /api/\nDisallow: /dashboard\nDisallow: /commercial/\nSitemap: ${publicOrigin}/sitemap.xml\n` });
          this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${publicOrigin}/</loc></url><url><loc>${publicOrigin}/privacy</loc></url></urlset>` });
        },
      },
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          cleanupOutdatedCaches: true,
          navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/socket\.io(?:\/|$)/],
          runtimeCaching: [],
        },
        manifest: {
          id: '/',
          name: "EkaVio",
          short_name: "EkaVio",
          description: 'Tenant-aware operations for clinics and service businesses.',
          start_url: '/',
          scope: '/',
          theme_color: "#4f46e5",
          background_color: "#f5f7fb",
          display: "standalone",
          icons: [
            { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
      }),
    ],
  };
});
