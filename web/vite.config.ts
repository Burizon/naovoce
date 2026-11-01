import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The web app talks to the Django API on the same origin; in development Vite
// forwards API, admin and media requests to a locally running backend.
const apiOrigin = process.env.NAOVOCE_API_ORIGIN ?? "http://127.0.0.1:8000";
const backend = { target: apiOrigin, changeOrigin: true };

export default defineConfig({
  plugins: [react()],
  base: "/",
  server: {
    proxy: { "/api": backend, "/admin": backend, "/media": backend, "/static": backend },
  },
  build: { outDir: "dist", sourcemap: true },
});
