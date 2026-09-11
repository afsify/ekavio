import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: "Eka Vio",
        short_name: "EkaVio",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone"
      }
    })
  ],
});
