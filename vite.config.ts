import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const releaseId =
  (process.env["RC_FRONTEND_RELEASE_ID"] || "dev")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 16) || "dev";

export default defineConfig({
  publicDir: "frontend/public",
  build: {
    rolldownOptions: {
      output: {
        entryFileNames: `assets/[name]-${releaseId}-[hash].js`,
        chunkFileNames: `assets/[name]-${releaseId}-[hash].js`,
      },
    },
  },
  plugins: [
    tanstackStart({ srcDirectory: "frontend/src", server: { entry: "server" } }),
    viteReact(),
    tailwindcss(),
    nitro({ publicAssets: [{ dir: "frontend/public", maxAge: 0 }] }),
  ],
  resolve: {
    tsconfigPaths: true,
    dedupe: ["react", "react-dom", "@tanstack/react-router"],
  },
});
