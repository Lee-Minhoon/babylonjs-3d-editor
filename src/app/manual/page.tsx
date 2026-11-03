import type { Metadata } from "next";

import { ManualPage } from "@/features/editor";

export const metadata: Metadata = {
  title: "사용 설명서 · Babylon.js 3D Editor",
  description: "단축키, 카메라 조작, 메쉬 종류와 편집 기능 안내",
};

export default function Manual() {
  return <ManualPage />;
}
