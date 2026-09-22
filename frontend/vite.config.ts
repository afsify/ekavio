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

  return {
    plugins: [
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
          name: "Eka Vio",
          short_name: "EkaVio",
          description: 'Tenant-aware operations for clinics and service businesses.',
          start_url: '/',
          scope: '/',
          theme_color: "#0f172a",
          background_color: "#0f172a",
          display: "standalone",
          icons: [{
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          }],
        },
      }),
    ],
  };
});
