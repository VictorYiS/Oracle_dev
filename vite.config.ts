import preact from "@preact/preset-vite";
import { defineConfig } from "vitest/config";

// base "./" keeps every asset URL relative, so the same build works under
// GitHub Pages (/Oracle_dev/) and as a multi-file claude.ai Artifact.
export default defineConfig({
  base: "./",
  plugins: [preact()],
  define: {
    __BUILD_ID__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? "dev"),
  },
  build: {
    target: "es2022",
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
