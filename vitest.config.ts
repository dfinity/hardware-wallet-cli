import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: ".",
    testTimeout: 60_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    exclude: ["**/dist/**", "**/node_modules/**"],
  },
});
