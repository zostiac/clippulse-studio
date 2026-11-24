import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Keep the development server local by default. Opt into LAN access
    // deliberately rather than accepting arbitrary Host headers.
    host: process.env.VITE_DEV_HOST || "127.0.0.1",
    port: 5173,
    strictPort: true,
    allowedHosts: ["localhost", "127.0.0.1"],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: false,
      },
      "/media": {
        target: "http://127.0.0.1:8000",
        changeOrigin: false,
      },
    },
  },
});
