import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the control plane runs on :4100 and is proxied, so the
// refresh cookie stays same-origin. In production the control plane serves
// this build itself (INVEON_DASHBOARD_DIR).
const target = process.env.INVEON_API_URL ?? "http://localhost:4100";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": { target, changeOrigin: false },
      "/install.sh": { target },
      "/agent": { target },
    },
  },
  preview: { port: 3100 },
});
