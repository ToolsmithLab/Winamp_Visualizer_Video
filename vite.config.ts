import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: "src/renderer",
  base: "./",
  build: {
    outDir: resolve(__dirname, "dist/renderer"),
    emptyOutDir: true
  }
});
