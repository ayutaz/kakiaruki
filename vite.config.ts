import { defineConfig } from "vitest/config";

export default defineConfig({
  // GitHub Pages はリポジトリ名のサブパス配下で配信される。
  // 相対パスにしておけば、ルート直下でもサブパス配下でも同じ成果物が動く。
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
