import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * Three pages, and one of them is not really this build's.
 *
 * `bar/index.html` is what Zebar loads off disk, unbundled, on Windows - that is why
 * everything under `bar/` is plain JavaScript with no import that needs resolving. It is
 * listed here as well so the hosted preview frames the SAME document rather than a second
 * copy of it that could drift.
 */
export default defineConfig({
  root: resolve(import.meta.dirname, "."),
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        root: resolve(import.meta.dirname, "index.html"),
        bar: resolve(import.meta.dirname, "bar/index.html"),
        preview: resolve(import.meta.dirname, "preview/index.html"),
      },
    },
  },
  server: { port: 4188 },
  preview: { port: 4188 },
});
