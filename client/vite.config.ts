import { defineConfig } from "vite";

export default defineConfig({
  // If the client is served under a path (e.g. samhopkins.dev/game), set base: "/game/" (DESIGN.md §9.4).
  base: "/",
  server: { port: 5173, strictPort: true },
  build: { target: "es2022" },
  // Which commit this build is, shown in the F3 overlay so we can tell what's deployed.
  define: { __BUILD_COMMIT__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev") },
});
