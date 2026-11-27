import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const outDir = "static/editor_next/konva_assets";
const sharedStudentRenderer = resolve(__dirname, "../../../packages/student-renderer/src/index.ts");

export default defineConfig({
  plugins: [react(), copyMathJaxAssets()],
  base: "/static/editor_next/konva_assets/",
  resolve: {
    dedupe: ["react", "react-dom", "three"],
    alias: {
      "@modu/student-renderer": sharedStudentRenderer,
      "react/jsx-runtime": resolve(__dirname, "node_modules/react/jsx-runtime"),
      "react": resolve(__dirname, "node_modules/react"),
      "three": resolve(__dirname, "node_modules/three"),
    },
  },
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: { editor: "index.html", teacher: "teacher.html" },
      output: {
        entryFileNames: (chunk) => chunk.name === "teacher" ? "teacher.js" : "editor-konva.js",
        chunkFileNames: "editor-konva-[name]-[hash].js",
        manualChunks(id) {
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/") || id.includes("node_modules/scheduler/")) {
            return "react-vendor";
          }
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.names?.some((name) => name === "teacher.css")) return "teacher[extname]";
          if (assetInfo.names?.some((name) => name.endsWith(".css"))) return "editor-konva[extname]";
          return "editor-konva-[name][extname]";
        },
      },
    },
  },
});

function copyMathJaxAssets() {
  return {
    name: "copy-mathjax-assets",
    closeBundle() {
      copyDirectory(resolve("node_modules/mathjax"), resolve(outDir, "mathjax"));
      copyDirectory(resolve("node_modules/@mathjax/mathjax-newcm-font"), resolve(outDir, "mathjax-newcm"));
    },
  };
}

function copyDirectory(source: string, target: string): void {
  if (!existsSync(source)) return;
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
}
