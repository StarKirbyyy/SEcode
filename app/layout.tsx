import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";

import { AppShell } from "./ui/shell/app-shell";
import { AppShellProvider } from "./ui/shell/app-shell-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SEcode — 本地编程智能体",
  description: "在可信本地工作区中检索、修改并验证代码的可审计编程智能体。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} anim`}
    >
      <body>
        <AppShellProvider>
          <Suspense fallback={<div className="shell-loading" role="status">正在打开 SEcode…</div>}>
            <AppShell>{children}</AppShell>
          </Suspense>
        </AppShellProvider>
      </body>
    </html>
  );
}
