import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 단위 테스트: src 안의 *.test.ts (Node + Babylon NullEngine, 브라우저 없음).
// 브라우저가 필요한 시나리오는 e2e/ (Playwright)에 둔다.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
