import { resolve } from "path";
import { defineConfig } from "vite";
import minimist from "minimist";
import { viteStaticCopy } from "vite-plugin-static-copy";
import livereload from "rollup-plugin-livereload";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import fg from "fast-glob";

const args = minimist(process.argv.slice(2));
const isWatch = args.watch || args.w || false;
const devDistDir = process.env.SYPLUGINDIR ? process.env.SYPLUGINDIR + "/sy-recite-plugin" : "build";
const distDir = devDistDir;

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },

  plugins: [
    svelte(),
    viteStaticCopy({
      targets: [
        { src: "./README*.md", dest: "./" },
        { src: "./icon.png", dest: "./" },
        { src: "./preview.png", dest: "./" },
        // 群组二维码（QQ 频道 + 飞书群合并压缩图，tools/gen-group-qr.mjs 生成）
        { src: "./group-qr.png", dest: "./" },
        { src: "./plugin.json", dest: "./" },
        { src: "./src/i18n/**", dest: "./i18n/" },
        // AI 说明书（内核 agent 不自动发现插件目录 skills——官方只扫 workspace/storage/ai 与
        // ~/.agents/skills 两根；打包供文件浏览型 AI 客户端发现+用户手动装入）。
        // 目录整拷：`**/*` glob 会把子目录文件平铺出重复副本（□5 实测）
        { src: "./skills", dest: "./" },
      ],
    }),
  ],

  define: {
    "process.env.DEV_MODE": `"${isWatch}"`,
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
  },

  build: {
    outDir: distDir,
    emptyOutDir: false,
    sourcemap: false,
    minify: isWatch ? false : "esbuild",

    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      fileName: "index",
      formats: ["cjs"],
    },

    rollupOptions: {
      plugins: [
        ...(isWatch
          ? [
            livereload(devDistDir),
            {
              name: "watch-external",
              async buildStart() {
                const files = await fg([
                  "src/i18n/*.json",
                  "./plugin.json",
                ]);
                for (const file of files) {
                  this.addWatchFile(file);
                }
              },
            },
          ]
          : []),
      ],

      external: ["siyuan", "process", "fs", "fs/promises", "os", "path", "util", "child_process"],

      output: {
        entryFileNames: "[name].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === "style.css") {
            return "index.css";
          }
          return assetInfo.name;
        },
      },
    },
  },
});
