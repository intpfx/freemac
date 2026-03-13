import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3200",
      "/auth": "http://127.0.0.1:3200",
      "/setup": "http://127.0.0.1:3200",
      "/system": "http://127.0.0.1:3200",
      "/agent": "http://127.0.0.1:3200",
      "/events": "http://127.0.0.1:3200",
    },
  },
  build: {
    outDir: "dist",
  },
});
