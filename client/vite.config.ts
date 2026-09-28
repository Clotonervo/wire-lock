import { defineConfig } from "vite";

export default defineConfig({
  // If the client is served under a path (e.g. samhopkins.dev/game), set base: "/game/" (DESIGN.md §9.4).
  base: "/",
  server: { port: 5173 },
  build: { target: "es2022" },
});
