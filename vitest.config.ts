import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@evidencegraph/domain": path.resolve(__dirname, "packages/domain/src/index.ts"),
      "@evidencegraph/engine": path.resolve(__dirname, "packages/engine/src/index.ts"),
      "@evidencegraph/fixtures": path.resolve(__dirname, "packages/fixtures/src/index.ts"),
      "@": path.resolve(__dirname, "apps/web/src"),
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/web/tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    // The JSON report feeds the "tests passing" figure on the landing page (gitignored .data/).
    reporters: ["default", "json"],
    outputFile: { json: ".data/test-results.json" },
  },
});
