import { defineConfig } from "vitest/config";
import path from "node:path";

// Sprint #7: minimal Vitest config — Node environment, "@/" alias matching
// tsconfig.json's path map, only picks up *.test.ts files under src/.
// We run tests with `npm test` (one-shot) or `npm run test:watch` for dev.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Reasonable default for unit tests — tweak per-file with vi.useFakeTimers
    // when needed for time-sensitive assertions.
    testTimeout: 5_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
