import { defineConfig } from "@playwright/test";

/*
 * E2E: 실제 브라우저에서 에디터 시나리오를 돌린다 (e2e/*.spec.ts).
 * 프로덕션 빌드(next build && next start)를 3010 포트에 띄운다 — 개발 서버(next dev)와 겹치지 않게.
 * 이미 3010에 서버가 떠 있으면 재사용한다. 브라우저는 설치된 Chrome (WebGPU, 없으면 WebGL 폴백).
 */
const PORT = 3010;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  // 브라우저마다 WebGPU 컨텍스트를 만들어서, 너무 많이 동시에 띄우면 씬 준비가 늦어져 타임아웃이 난다
  workers: 3,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
    viewport: { width: 1400, height: 820 },
    launchOptions: { args: ["--enable-unsafe-webgpu"] },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
