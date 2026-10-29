import type { Metadata } from "next";
import { Geist_Mono, Roboto } from "next/font/google";

import { cn } from "@/lib/utils";

import "./globals.css";

// globals.css: --font-sans ← Roboto, --font-mono ← Geist Mono
const roboto = Roboto({ subsets: ["latin"], variable: "--font-sans" });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Babylon.js 3D Editor",
  description: "Next.js + Babylon.js 3D editor",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={cn(
        // 에디터는 다크 테마 고정 (shadcn 토큰의 .dark 값 사용)
        "dark",
        "h-full",
        "antialiased",
        geistMono.variable,
        "font-sans",
        roboto.variable,
      )}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
