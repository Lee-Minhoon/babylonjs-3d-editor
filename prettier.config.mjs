/**
 * Prettier 기본값(printWidth 80, 큰따옴표, 세미콜론, trailingComma "all")을 그대로 따른다.
 * 스타일 옵션을 늘리지 말 것 — 포맷 논쟁을 없애는 게 Prettier를 쓰는 이유.
 *
 * @see https://prettier.io/docs/configuration
 * @type {import("prettier").Config}
 */
const config = {
  plugins: ["prettier-plugin-tailwindcss"],
  // Tailwind v4: 클래스 정렬 기준이 되는 CSS 엔트리
  tailwindStylesheet: "./src/app/globals.css",
};

export default config;
